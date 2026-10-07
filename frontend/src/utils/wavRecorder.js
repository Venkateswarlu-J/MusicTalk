/**
 * Studio-Grade Web Audio API 16-bit PCM WAV Recorder
 * Records uncompressed audio from the microphone, producing standard RIFF/WAVE files
 * fully compatible with Librosa, SoundFile, PyTorch, and all browser players.
 */

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function encodeWAV(samples, sampleRate = 22050, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length: 36 + dataSize
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  // Subchunk1Size (16 for PCM)
  view.setUint32(16, 16, true);
  // AudioFormat (1 for PCM)
  view.setUint16(20, 1, true);
  // NumChannels
  view.setUint16(22, numChannels, true);
  // SampleRate
  view.setUint32(24, sampleRate, true);
  // ByteRate
  view.setUint32(28, byteRate, true);
  // BlockAlign
  view.setUint16(32, blockAlign, true);
  // BitsPerSample
  view.setUint16(34, 16, true);

  // "data" sub-chunk
  writeString(view, 36, 'data');
  // Subchunk2Size
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples with clipping protection
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export class WavRecorder {
  constructor() {
    this.audioCtx = null;
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.analyser = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.sampleRate = 22050;
    this.freqDataArray = null;
    this.timeDataArray = null;
    this.startTime = 0;
  }

  async start() {
    // 1. Request microphone access with high-fidelity audio constraints
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } else {
      const legacyGetUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia;
      if (!legacyGetUserMedia) {
        throw new Error(
          'Microphone access is not supported in this browser. Please ensure HTTPS or localhost is used.'
        );
      }
      this.stream = await new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
      });
    }

    // 2. Initialize AudioContext with resilient sample rate handling
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    try {
      this.audioCtx = new AudioContextClass({ sampleRate: 22050 });
    } catch {
      // Fallback for browsers/hardware with fixed sample rate constraints
      this.audioCtx = new AudioContextClass();
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sampleRate = this.audioCtx.sampleRate || 22050;
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    // 3. Setup Analyser for real-time visualizers
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freqDataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDataArray = new Uint8Array(this.analyser.fftSize);
    this.source.connect(this.analyser);

    // 4. Setup Audio Processor for sample collection
    const bufferSize = 4096;
    this.processor = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);
    this.recordedChunks = [];

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputChannel = e.inputBuffer.getChannelData(0);
      this.recordedChunks.push(new Float32Array(inputChannel));
    };

    this.analyser.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);

    this.isRecording = true;
    this.startTime = Date.now();
  }

  getAnalyserData() {
    if (this.analyser && this.freqDataArray) {
      this.analyser.getByteFrequencyData(this.freqDataArray);
      return this.freqDataArray;
    }
    return new Uint8Array(0);
  }

  getTimeDomainData() {
    if (this.analyser && this.timeDataArray) {
      this.analyser.getByteTimeDomainData(this.timeDataArray);
      return this.timeDataArray;
    }
    return new Uint8Array(0);
  }

  getVolumeLevel() {
    if (!this.analyser || !this.freqDataArray) return 0;
    this.analyser.getByteFrequencyData(this.freqDataArray);
    let sum = 0;
    for (let i = 0; i < this.freqDataArray.length; i++) {
      sum += this.freqDataArray[i];
    }
    return Math.min(100, Math.round((sum / (this.freqDataArray.length * 255)) * 100));
  }

  getLatestChunk(durationSeconds = 5) {
    if (!this.audioCtx || this.recordedChunks.length === 0) return null;
    const targetSamples = this.sampleRate * durationSeconds;

    let samplesCount = 0;
    const chunksToGrab = [];

    for (let i = this.recordedChunks.length - 1; i >= 0; i--) {
      chunksToGrab.unshift(this.recordedChunks[i]);
      samplesCount += this.recordedChunks[i].length;
      if (samplesCount >= targetSamples) break;
    }

    if (samplesCount === 0) return null;

    const mergedSamples = new Float32Array(samplesCount);
    let offset = 0;
    for (const chunk of chunksToGrab) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWAV(mergedSamples, this.sampleRate);
  }

  async stop() {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    const currentRate = this.sampleRate;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        await this.audioCtx.close();
      } catch (e) {
        console.warn('AudioContext close notice:', e);
      }
      this.audioCtx = null;
    }

    const totalLength = this.recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (totalLength === 0) {
      throw new Error('No audio data was captured. Please check microphone permissions and speak closer to the mic.');
    }

    const mergedSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWAV(mergedSamples, currentRate);
  }
}
