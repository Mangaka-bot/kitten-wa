import { getClient } from '../../src/index.js';

export const plugin = async (sock, ctx) => {
  const args = ctx.body?.trim().split(/\s+/) ?? [];
  const type = args[1]?.toLowerCase();

  if (!type || (type !== 'qr' && type !== 'otp')) {
    return await sock.sendMessage(
      ctx.roomId,
      { text: 'Please specify the pairing type: `qr` or `otp`.\n\n*Usage:*\n- `!pairing qr`\n- `!pairing otp`' },
      { quoted: ctx.raw }
    );
  }

  const options = {
    silent: true,
    maxRetries: 2,
    maxPairingAttempts: 1,
    onPairingAttemptsExceeded: async () => {
      await sock.sendMessage(
        ctx.roomId,
        { text: 'Pairing code expired. Please try again' },
        { quoted: ctx.raw }
      )
    }
  }

  if (type === 'qr') {
    await getClient({
      ...options,
      onPairing: async ({ qr }) => {
        const qrImg = await qr.buffer();
        await sock.sendMessage(
          ctx.roomId,
          { image: qrImg, caption: 'Scan this QR code to pair your device' },
          { quoted: ctx.raw }
        );
      },
      onPairingAttemptsExceeded: async () => {
        await sock.sendMessage(
          ctx.roomId,
          { text: 'Pairing attempts exceeded. Please try again' },
          { quoted: ctx.raw }
        );
      },
      onConnect: async ({ client }) => {
        await sock.sendMessage(
          ctx.roomId,
          { text: `Session *${client.id}* paired and connected successfully!` },
          { quoted: ctx.raw }
        );
      },
    });
  } else if (type === 'otp') {
    const phone = await ctx.pn();

    if (!phone) {
      return await sock.sendMessage(
        ctx.roomId,
        { text: 'Failed to extract phone number' },
        { quoted: ctx.raw }
      );
      return;
    }

    await getClient({
      ...options,
      onPairing: async ({ requestPairingCode }) => {
        const code = await requestPairingCode(phone);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') ?? code;
        await sock.sendMessage(
          ctx.roomId,
          { text: `Your OTP pairing code: *${formattedCode}*` },
          { quoted: ctx.raw }
        );
      },
      onPairingAttemptsExceeded: async () => {
        await sock.sendMessage(
          ctx.roomId,
          { text: 'Pairing attempts exceeded. Please try again' },
          { quoted: ctx.raw }
        );
      },
      onConnect: async ({ client }) => {
        await sock.sendMessage(
          ctx.roomId,
          { text: `Session *${client.id}* paired and connected successfully!` },
          { quoted: ctx.raw }
        );
      },
    });
  }
};

plugin.events = ['messages.upsert'];
plugin.match = ['pairing'];