import { Injectable, OnModuleDestroy } from '@nestjs/common';

export type EscrowState =
  | 'FUNDED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RELEASED'
  | 'COMPLETED'
  | 'REFUNDED';
export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationType =
  | 'FUNDED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'DISPUTED'
  | 'COMPLETED'
  | 'REFUNDED';

export interface EscrowRecord {
  id: string;
  itemName: string;
  itemRef: string;
  amount: number;
  currency: string;
  buyerAddress: string;
  vendorAddress: string;
  state: EscrowState;
  trackingId: string | null;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecord {
  id: string;
  escrowId: string;
  type: NotificationType;
  channel: NotificationChannel;
  recipientAddress: string;
  providerMessageId: string | null;
  createdAt: Date;
}

type EscrowCreateInput = Omit<
  EscrowRecord,
  'id' | 'state' | 'trackingId' | 'shippedAt' | 'createdAt' | 'updatedAt'
> & {
  state?: EscrowState;
  trackingId?: string | null;
  shippedAt?: Date | null;
};

type EscrowUpdateInput = Partial<
  Pick<EscrowRecord, 'state' | 'trackingId' | 'shippedAt'>
>;

interface EscrowWhereInput {
  state?: EscrowState;
  vendorAddress?: string;
  itemRef?: string;
  shippedAt?: { lte: Date };
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private escrows = new Map<string, EscrowRecord>();
  private notifications = new Map<string, NotificationRecord>();
  private escrowId = 1;
  private notificationId = 1;

  escrow = {
    create: ({ data }: { data: EscrowCreateInput }): Promise<EscrowRecord> => {
      const now = new Date();
      const escrow: EscrowRecord = {
        ...data,
        id: String(this.escrowId++),
        state: data.state ?? 'FUNDED',
        trackingId: data.trackingId ?? null,
        shippedAt: data.shippedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.escrows.set(escrow.id, escrow);
      return Promise.resolve({ ...escrow });
    },
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<EscrowRecord | null> => {
      const escrow = this.escrows.get(where.id);
      return Promise.resolve(escrow ? { ...escrow } : null);
    },
    findMany: ({
      where,
    }: {
      where?: EscrowWhereInput;
    } = {}): Promise<EscrowRecord[]> => {
      let results = [...this.escrows.values()];
      if (where?.state) {
        results = results.filter((e) => e.state === where.state);
      }
      if (where?.vendorAddress) {
        results = results.filter(
          (e) => e.vendorAddress === where.vendorAddress,
        );
      }
      if (where?.itemRef) {
        results = results.filter((e) => e.itemRef === where.itemRef);
      }
      if (where?.shippedAt?.lte) {
        const lte = where.shippedAt.lte;
        results = results.filter(
          (e) => e.shippedAt !== null && e.shippedAt <= lte,
        );
      }
      return Promise.resolve(results.map((e) => ({ ...e })));
    },

    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: EscrowUpdateInput;
    }): Promise<EscrowRecord> => {
      const existing = this.escrows.get(where.id);
      if (!existing) {
        throw new Error(`Escrow ${where.id} not found`);
      }
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.escrows.set(where.id, updated);
      return Promise.resolve({ ...updated });
    },
    deleteMany: (): Promise<{ count: number }> => {
      const count = this.escrows.size;
      this.escrows.clear();
      return Promise.resolve({ count });
    },
  };

  notification = {
    create: ({
      data,
    }: {
      data: Omit<NotificationRecord, 'id' | 'createdAt'>;
    }): Promise<NotificationRecord> => {
      const notification: NotificationRecord = {
        ...data,
        id: String(this.notificationId++),
        createdAt: new Date(),
      };
      this.notifications.set(notification.id, notification);
      return Promise.resolve({ ...notification });
    },
    findMany: (): Promise<NotificationRecord[]> =>
      Promise.resolve(
        [...this.notifications.values()].map((notification) => ({
          ...notification,
        })),
      ),
    deleteMany: (): Promise<{ count: number }> => {
      const count = this.notifications.size;
      this.notifications.clear();
      return Promise.resolve({ count });
    },
  };

  async reset(): Promise<void> {
    await this.notification.deleteMany();
    await this.escrow.deleteMany();
    this.escrowId = 1;
    this.notificationId = 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }
}
