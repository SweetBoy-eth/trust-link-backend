import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { UpdateBuyerContactDto } from './dto/update-buyer-contact.dto';
import { EscrowService } from './escrow.service';
import { BuyerDisputeService } from './buyer-dispute.service';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@SkipThrottle({ auth: true }) // Skip auth limit for escrow endpoints
@Controller('escrow')
export class EscrowController {
  constructor(
    private readonly escrowService: EscrowService,
    private readonly buyerDisputeService: BuyerDisputeService,
  ) {}

  /**
   * Creates a new escrow in the FUNDED state.
   *
   * @param dto - Escrow details including item name, amount, currency and buyer address
   * @param user - Authenticated vendor making the request
   * @returns Created escrow record with payment URL
   * @throws BadRequestException if amount is not positive
   * @throws ConflictException if duplicate item reference exists
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (vendor)
   * @rateLimit 10 requests per 60 seconds
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 10, ttl: 60000 } })
  createEscrow(@Body() dto: CreateEscrowDto, @CurrentUser() user: AuthUser) {
    return this.escrowService.createEscrow(dto, user.address);
  }

  /**
   * Generates a pre-signed S3 upload URL for evidence files.
   *
   * @param fileName - Original filename for the upload
   * @param user - Authenticated user requesting the upload URL
   * @returns Upload URL, public URL, and expiration details
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT
   * @rateLimit evidence-upload throttler (default 10 per 60 seconds)
   */
  @Post('evidence-upload')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtGuard)
  @Throttle('evidence-upload')
  evidenceUpload(
    @Query('fileName') fileName: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escrowService.generateEvidenceUploadUrl(user.address, fileName);
  }

  /**
   * Returns the public projection of an escrow by ID.
   * Sensitive fields (addresses, contact info) are excluded.
   *
   * @param id - UUID of the escrow to retrieve
   * @returns Public escrow data without internal identifiers
   * @throws NotFoundException if escrow does not exist
   */
  @Get(':id')
  getEscrow(@Param('id', ParseUUIDPipe) id: string) {
    return this.escrowService.getPublicEscrow(id);
  }

  /**
   * Returns chronological event history for an escrow.
   * Events include CREATED, SHIPPED, DELIVERED, CANCELLED etc.
   *
   * @param id - UUID of the escrow
   * @returns Array of event objects with name and timestamp
   */
  @Get(':id/events')
  @Throttle({ public: { limit: 100, ttl: 60000 } })
  getEvents(@Param('id', ParseUUIDPipe) id: string) {
    return this.escrowService.getEvents(id);
  }

  /**
   * Returns shipment tracking status for an escrow.
   * Results are cached for 60 seconds.
   *
   * @param id - UUID of the escrow
   * @returns Tracking status with events, estimated delivery, and carrier info
   * @throws NotFoundException if tracking info is not available or escrow not found
   */
  @Get(':id/tracking')
  async getTracking(@Param('id', ParseUUIDPipe) id: string) {
    return this.escrowService.getTracking(id);
  }

  // ── Issue #28 ─────────────────────────────────────────────────────────────
  // No JwtGuard: the buyer is not authenticated via SEP-10 at payment time.
  // The endpoint is intentionally unauthenticated — the escrow ID in the URL
  // acts as the possession proof (it was shared with the buyer by the vendor).
  // Rate-limited tightly to prevent enumeration.
  /**
   * Stores encrypted buyer contact information on the escrow.
   * This endpoint is intentionally unauthenticated — the escrow ID
   * serves as the possession proof. At least one of email or phone
   * must be provided.
   *
   * @param id - UUID of the escrow
   * @param dto - Buyer contact details (email and/or phone)
   * @returns Acknowledgement message
   * @throws NotFoundException if escrow does not exist
   * @throws ConflictException if escrow is in a terminal state
   * @authentication None (unauthenticated endpoint)
   * @rateLimit 10 requests per 60 seconds
   */
  @Patch(':id/buyer-contact')
  @HttpCode(HttpStatus.OK)
  @Throttle({ public: { limit: 10, ttl: 60000 } })
  updateBuyerContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuyerContactDto,
  ) {
    return this.escrowService.updateBuyerContact(id, dto);
  }

  /**
   * Marks a funded escrow as shipped with a carrier tracking ID.
   * Only the vendor who created the escrow can ship it.
   *
   * @param id - UUID of the escrow
   * @param dto - Shipment details containing the tracking ID
   * @param user - Authenticated vendor making the request
   * @returns Updated escrow record with SHIPPED state
   * @throws ForbiddenException if caller is not the escrow vendor
   * @throws ConflictException if escrow is not in FUNDED state
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (vendor)
   * @rateLimit 20 requests per 60 seconds
   */
  @Patch(':id/ship')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 20, ttl: 60000 } })
  shipEscrow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escrowService.handleShipment(id, user.address, dto.trackingId);
  }

  /**
   * Cancels a FUNDED escrow. Only the buyer or vendor can cancel.
   *
   * @param id - UUID of the escrow to cancel
   * @param user - Authenticated caller (buyer or vendor)
   * @returns Updated escrow record with CANCELLED state
   * @throws ForbiddenException if caller is not the buyer or vendor
   * @throws ConflictException if escrow is not in FUNDED state
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (buyer or vendor)
   * @rateLimit 10 requests per 60 seconds
   */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 10, ttl: 60000 } })
  cancelEscrow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escrowService.cancelEscrow(id, user.address);
  }

  /**
   * Cancels a CREATED (pending) escrow with on-chain state verification.
   * If the escrow has been funded on-chain, a refund is submitted before
   * cancellation. Only the buyer or vendor can cancel.
   *
   * @param id - UUID of the escrow to cancel
   * @param user - Authenticated caller (buyer or vendor)
   * @returns Updated escrow record with CANCELLED state
   * @throws ForbiddenException if caller is not the buyer or vendor
   * @throws ConflictException if escrow is not in CREATED state
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (buyer or vendor)
   * @rateLimit 10 requests per 60 seconds
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 10, ttl: 60000 } })
  cancelPendingEscrow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escrowService.cancelPendingEscrow(id, user.address);
  }

  /**
   * Opens a dispute against an escrow. The buyer provides a reason
   * category, detailed description, and optional evidence URLs.
   *
   * @param id - UUID of the escrow to dispute
   * @param dto - Dispute details (reason, description, evidence URLs)
   * @param user - Authenticated buyer making the request
   * @returns Created dispute record
   * @throws ForbiddenException if caller is not the buyer
   * @throws ConflictException if escrow is in a terminal state
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (buyer)
   * @rateLimit 5 requests per 60 seconds
   */
  @Post(':id/dispute')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 5, ttl: 60000 } })
  openDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenDisputeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.buyerDisputeService.openDispute(id, user.address, dto);
  }

  /**
   * Returns the dispute details for an escrow if one exists.
   *
   * @param id - UUID of the escrow
   * @param user - Authenticated caller
   * @returns Dispute record or not-found error
   * @throws NotFoundException if no dispute exists for this escrow
   * @throws ForbiddenException if caller is not the buyer or vendor
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT
   * @rateLimit 30 requests per 60 seconds
   */
  @Get(':id/dispute')
  @UseGuards(JwtGuard)
  @Throttle({ public: { limit: 30, ttl: 60000 } })
  getDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.buyerDisputeService.getDispute(id, user.address);
  }
}
