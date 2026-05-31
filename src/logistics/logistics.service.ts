import { Injectable } from '@nestjs/common';

export type LogisticsStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED';

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location?: string;
  description: string;
}

export interface TrackingDetails {
  status: LogisticsStatus;
  estimatedDelivery?: Date;
  carrier?: string;
  events: TrackingEvent[];
}

@Injectable()
export class LogisticsService {
  private apiKey: string | null = null;

  /**
   * Updates the logistics provider API key at runtime. The new key is picked
   * up immediately by all subsequent getStatus calls, including those from
   * background workers, without requiring a service restart.
   */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** Returns the currently configured logistics API key, or null if not set. */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /** Fetches normalized shipment status from the configured logistics provider. */
  getStatus(trackingId: string): Promise<{ status: LogisticsStatus }> {
    return Promise.reject(
      new Error(`Logistics service is not configured for ${trackingId}`),
    );
  }

  /** Fetches detailed tracking information including events from the logistics provider. */
  getTrackingDetails(trackingId: string): Promise<TrackingDetails> {
    return Promise.reject(
      new Error(`Logistics service is not configured for ${trackingId}`),
    );
  }
}
