import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateCondition } from './notification-rules';

describe('evaluateCondition', () => {
  it('should evaluate daysUntil condition correctly', () => {
    const now = new Date('2026-03-11');
    // nextDate is 5 days away
    const record = { nextDate: new Date('2026-03-16') };
    const result = evaluateCondition('daysUntil(nextDate) <= 7', record, now);
    expect(result).toBe(true);
  });

  it('should return false when condition not met', () => {
    const now = new Date('2026-03-11');
    const record = { nextDate: new Date('2026-03-25') };
    const result = evaluateCondition('daysUntil(nextDate) <= 7', record, now);
    expect(result).toBe(false);
  });

  it('should evaluate daysSince condition correctly', () => {
    const now = new Date('2026-03-11');
    const record = { lastDone: new Date('2026-02-01') };
    const result = evaluateCondition('daysSince(lastDone) >= 30', record, now);
    expect(result).toBe(true);
  });
});
