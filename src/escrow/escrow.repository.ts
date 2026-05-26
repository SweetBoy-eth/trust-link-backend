import { Injectable } from '@nestjs/common';
import {
  EscrowRecord,
  EscrowState,
  PrismaService,
} from '../prisma/prisma.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';

@Injectable()
export class EscrowRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateEscrowDto, vendorAddress: string): Promise<EscrowRecord> {
    return this.prisma.escrow.create({
      data: {
        ...dto,
        vendorAddress,
      },
    });
  }

  findById(id: string): Promise<EscrowRecord | null> {
    return this.prisma.escrow.findUnique({ where: { id } });
  }

  findByVendor(vendorAddress: string): Promise<EscrowRecord[]> {
    return this.prisma.escrow.findMany({ where: { vendorAddress } });
  }

  findByBuyer(buyerAddress: string): Promise<EscrowRecord[]> {
    return this.prisma.escrow.findMany({ where: { buyerAddress } });
  }

  updateState(id: string, state: EscrowState): Promise<EscrowRecord> {
    return this.prisma.escrow.update({ where: { id }, data: { state } });
  }

  updateTracking(id: string, trackingId: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({ where: { id }, data: { trackingId } });
  }

  markShipped(id: string, trackingId: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: { state: 'SHIPPED', trackingId },
    });
  }

  markDelivered(id: string, deliveredAt = new Date()): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: {
        state: 'DELIVERED',
        deliveredAt,
        deliveryRecordedAt: deliveredAt,
      },
    });
  }

  markAutoReleaseCompleted(
    id: string,
    txHash: string,
    submittedAt = new Date(),
  ): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: {
        state: 'COMPLETED',
        autoReleaseSubmittedAt: submittedAt,
        autoReleaseTxHash: txHash,
      },
    });
  }

  findShippedWithTracking(): Promise<EscrowRecord[]> {
    return this.prisma.escrow
      .findMany({ where: { state: 'SHIPPED' } })
      .then((escrows) =>
        escrows.filter((escrow) => Boolean(escrow.trackingId)),
      );
  }

  findAutoReleaseEligible(referenceTime = new Date()): Promise<EscrowRecord[]> {
    const threshold = new Date(referenceTime.getTime() - 48 * 60 * 60 * 1000);

    return this.prisma.escrow
      .findMany({ where: { state: 'SHIPPED' } })
      .then((escrows) =>
        escrows.filter(
          (escrow) =>
            escrow.deliveredAt !== null &&
            escrow.deliveredAt <= threshold &&
            escrow.disputeId === null &&
            escrow.autoReleaseTxHash === null,
        ),
      );
  }
}
