import { Injectable } from '@nestjs/common';
import { EscrowRecord, PrismaService } from '../prisma/prisma.service';
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

  findByVendorAndItem(
    vendorAddress: string,
    itemRef: string,
  ): Promise<EscrowRecord | null> {
    return this.prisma.escrow
      .findMany({
        where: { vendorAddress, itemRef },
      })
      .then((results) => results[0] ?? null);
  }

  findById(id: string): Promise<EscrowRecord | null> {
    return this.prisma.escrow.findUnique({ where: { id } });
  }

  findVendorEscrows(
    vendorAddress: string,
    state: string | undefined,
    sort: 'date' | 'amount',
    order: 'asc' | 'desc',
    page: number,
    limit: number,
  ): Promise<{ data: EscrowRecord[]; total: number }> {
    return this.prisma.escrow.findMany({
      where: { vendorAddress, state: state as any },
    }).then((records) => {
      const sorted = records.sort((a, b) => {
        const primary = sort === 'amount' ? a.amount - b.amount :
          a.createdAt.getTime() - b.createdAt.getTime();
        return order === 'asc' ? primary : -primary;
      });

      const total = sorted.length;
      const start = (page - 1) * limit;
      const data = sorted.slice(start, start + limit);
      return { data, total };
    });
  }

  markShipped(id: string, trackingId: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: { state: 'SHIPPED', trackingId, shippedAt: new Date() },
    });
  }

  markCompleted(id: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: { state: 'COMPLETED' },
    });
  }

  markRefunded(id: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: { state: 'REFUNDED' },
    });
  }

  markReleased(id: string): Promise<EscrowRecord> {
    return this.prisma.escrow.update({
      where: { id },
      data: { state: 'RELEASED' },
    });
  }

  findAutoReleaseEligible(cutoffDate: Date): Promise<EscrowRecord[]> {
    return this.prisma.escrow.findMany({
      where: { state: 'SHIPPED', shippedAt: { lte: cutoffDate } },
    });
  }
}
