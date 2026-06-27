import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth-user';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { AnalyticsService } from './analytics.service';
import { ChartDataResponse } from './analytics.dto';
import { AnalyticsStatsResponse } from './analytics-stats.dto';

@Controller('vendor/analytics')
@UseGuards(JwtGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Returns overall transaction statistics for the authenticated vendor.
   * Includes volume totals, conversion metrics, dispute rates, and
   * notification channel preferences.
   *
   * @param user - Authenticated vendor
   * @returns Transaction statistics and channel metrics
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (vendor)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getTransactionStats(
    @CurrentUser() user?: AuthUser,
  ): Promise<AnalyticsStatsResponse> {
    return this.analyticsService.getTransactionStats(user!.address);
  }

  /**
   * Returns daily transaction volume data for chart rendering.
   *
   * @param daysParam - Number of days to retrieve (default 30, max 365)
   * @param timezoneParam - Timezone for date grouping (default UTC)
   * @param user - Authenticated vendor
   * @returns Daily volume data with summary totals
   * @throws UnauthorizedException if Bearer token is missing or invalid
   * @authentication Requires valid SEP-10 JWT (vendor)
   */
  @Get('chart')
  @HttpCode(HttpStatus.OK)
  async getDailyVolumeChart(
    @Query('days') daysParam?: string,
    @Query('timezone') timezoneParam?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<ChartDataResponse> {
    let days = 30;
    let timezone = 'UTC';

    if (daysParam) {
      const parsed = parseInt(daysParam, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
        days = parsed;
      }
    }

    if (timezoneParam) {
      timezone = timezoneParam;
    }

    return this.analyticsService.getDailyVolumeChart(user!.address, days, timezone);
  }
}
