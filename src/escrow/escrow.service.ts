import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { EscrowRecord } from '../prisma/prisma.service';
import { EscrowResponseDto } from './dto/escrow-response.dto';
import { EscrowSummaryDto } from './dto/escrow-summary.dto';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { EscrowRepository } from './escrow.repository';

export type EscrowWithPaymentUrl = EscrowRecord & {
  paymentUrl: string;
};

@Injectable()
export class EscrowService {
  constructor(
    private readonly escrowRepository: EscrowRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createEscrow(
    dto: CreateEscrowDto,
    vendorAddress: string,
  ): Promise<EscrowWithPaymentUrl> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const existing = await this.escrowRepository.findByVendorAndItem(
      vendorAddress,
      dto.itemRef,
    );
    if (existing) {
      throw new ConflictException('Duplicate escrow for this item reference');
    }

    const escrow = await this.escrowRepository.create(dto, vendorAddress);
    await this.notificationsService.notifyFunded(escrow);
    return {
      ...escrow,
      paymentUrl: this.buildPaymentUrl(escrow.id),
    };
  }

  async findById(id: string): Promise<EscrowRecord> {
    const escrow = await this.escrowRepository.findById(id);
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    return escrow;
  }

  async getPublicEscrow(id: string): Promise<EscrowResponseDto> {
    const escrow = await this.findById(id);
    return this.toPublicEscrow(escrow);
  }

  async findVendorEscrows(
    vendorAddress: string,
    query: {
      state?: string;
      sort?: 'date' | 'amount';
      order?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: EscrowSummaryDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const sort = query.sort ?? 'date';
    const order = query.order ?? 'desc';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { data, total } = await this.escrowRepository.findVendorEscrows(
      vendorAddress,
      query.state,
      sort,
      order,
      page,
      limit,
    );

    return {
      data: data.map((escrow) => this.toSummary(escrow)),
      total,
      page,
      limit,
    };
  }

  private toPublicEscrow(escrow: EscrowRecord) {
    return {
      id: escrow.id,
      itemName: escrow.itemName,
      itemRef: escrow.itemRef,
      amount: escrow.amount,
      currency: escrow.currency,
      state: escrow.state,
      trackingId: escrow.trackingId,
      shippedAt: escrow.shippedAt,
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
    };
  }

  private toSummary(escrow: EscrowRecord) {
    return {
      id: escrow.id,
      itemName: escrow.itemName,
      itemRef: escrow.itemRef,
      amount: escrow.amount,
      currency: escrow.currency,
      state: escrow.state,
      trackingId: escrow.trackingId,
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
    };
  }

  private buildPaymentUrl(id: string): string {
    return `https://trust-link.local/pay/${id}`;
  }

  async handleShipment(
    escrowId: string,
    vendorAddress: string,
    trackingId: string,
  ): Promise<EscrowRecord> {
    if (!trackingId.trim()) {
      throw new BadRequestException('Tracking ID is required');
    }

    const escrow = await this.findById(escrowId);
    if (escrow.vendorAddress !== vendorAddress) {
      throw new ForbiddenException(
        'Only the escrow vendor can ship this order',
      );
    }

    if (escrow.state !== 'FUNDED') {
      throw new BadRequestException('Escrow must be funded before shipment');
    }

    const shipped = await this.escrowRepository.markShipped(
      escrow.id,
      trackingId,
    );
    await this.notificationsService.notifyShipped(shipped);
    return shipped;
  }
}
