import QRCode from 'qrcode';

export class QR {
  #raw;
  constructor(raw) {
    this.#raw = typeof raw === 'string' ? raw : (raw?.raw ?? String(raw ?? ''));
  }

  get raw() {
    return this.#raw;
  }

  async print(options = {}) {
    const terminalQR = await QRCode.toString(this.#raw, {
      type: 'terminal',
      small: true,
      ...options,
    });
    console.log(terminalQR);
    return terminalQR;
  }

  async buffer(options = {}) {
    return QRCode.toBuffer(this.#raw, {
      type: 'png',
      margin: 2,
      scale: 4,
      ...options,
    });
  }

  toString() {
    return this.#raw;
  }
}