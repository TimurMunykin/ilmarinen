import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let telegramService: TelegramService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-bot-token') },
        },
      ],
    }).compile();

    telegramService = module.get(TelegramService);
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('should send message to correct chat ID', async () => {
    await telegramService.sendMessage('123456', 'Hello');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-bot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '123456', text: 'Hello', parse_mode: 'HTML' }),
      }),
    );
  });

  it('should not send if bot token is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    const service = module.get(TelegramService);
    await service.sendMessage('123', 'test');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
