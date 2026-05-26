import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { EscrowRecord } from '../prisma/prisma.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { EscrowRepository } from './escrow.repository';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly escrowRepository: EscrowRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createEscrow(
    dto: CreateEscrowDto,
    vendorAddress: string,
  ): Promise<EscrowRecord> {
    try {
      // Validate that buyer and vendor are different
      if (dto.buyerAddress === vendorAddress) {
        throw new BadRequestException('Buyer and vendor addresses cannot be the same');
      }

      this.logger.log(`Creating escrow for item: ${dto.itemName}, amount: ${dto.amount} ${dto.currency}`);
      
      const escrow = await this.escrowRepository.create(dto, vendorAddress);
      
      // Notify asynchronously to avoid blocking the response
      this.notificationsService.notifyFunded(escrow).catch(error => {
        this.logger.error(`Failed to send funded notification for escrow ${escrow.id}`, error);
      });
      
      this.logger.log(`Escrow created successfully with ID: ${escrow.id}`);
      return escrow;
    } catch (error) {
      this.logger.error(`Failed to create escrow: ${error.message}`, error);
      throw error;
    }
  }

  async findById(id: string): Promise<EscrowRecord> {
    try {
      const escrow = await this.escrowRepository.findById(id);
      if (!escrow) {
        this.logger.warn(`Escrow not found with ID: ${id}`);
        throw new NotFoundException(`Escrow with ID ${id} not found`);
      }
      return escrow;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding escrow ${id}: ${error.message}`, error);
      throw new BadRequestException('Failed to retrieve escrow');
    }
  }

  async handleShipment(
    escrowId: string,
    vendorAddress: string,
    trackingId: string,
  ): Promise<EscrowRecord> {
    try {
      // Enhanced validation
      if (!trackingId?.trim()) {
        throw new BadRequestException('Tracking ID is required and cannot be empty');
      }

      if (trackingId.trim().length < 3) {
        throw new BadRequestException('Tracking ID must be at least 3 characters long');
      }

      const escrow = await this.findById(escrowId);
      
      // Authorization check
      if (escrow.vendorAddress !== vendorAddress) {
        this.logger.warn(`Unauthorized shipment attempt for escrow ${escrowId} by ${vendorAddress}`);
        throw new ForbiddenException('Only the escrow vendor can ship this order');
      }

      // State validation
      if (escrow.state !== 'FUNDED') {
        throw new ConflictException(`Cannot ship escrow in ${escrow.state} state. Escrow must be in FUNDED state.`);
      }

      // Check if already shipped
      if (escrow.trackingId) {
        throw new ConflictException(`Escrow already shipped with tracking ID: ${escrow.trackingId}`);
      }

      this.logger.log(`Shipping escrow ${escrowId} with tracking ID: ${trackingId}`);
      
      const shipped = await this.escrowRepository.markShipped(escrow.id, trackingId.trim());
      
      // Notify asynchronously
      this.notificationsService.notifyShipped(shipped).catch(error => {
        this.logger.error(`Failed to send shipped notification for escrow ${shipped.id}`, error);
      });
      
      this.logger.log(`Escrow ${escrowId} shipped successfully`);
      return shipped;
    } catch (error) {
      this.logger.error(`Failed to ship escrow ${escrowId}: ${error.message}`, error);
      throw error;
    }
  }
}
