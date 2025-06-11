/**
 * FFT Utilities for Z-Axis Vibration Analysis
 * Simple implementations of FFT and frequency analysis functions
 */

/**
 * Performs a simple FFT analysis on time series data
 * @param {Array<number>} signal - Array of signal values (raw Z values)
 * @param {number} samplingFreq - Sampling frequency in Hz
 * @returns {Object} Object containing frequency data
 */
export function performSimpleFFT(signal, samplingFreq) {
  // For small data sets, return simple estimation
  if (signal.length < 8) {
    return simpleFrequencyEstimate(signal, samplingFreq);
  }

  try {
    // Get nearest power of 2 for FFT efficiency
    const N = nextPowerOf2(signal.length);
    
    // Zero-pad the signal to length N
    const paddedSignal = [...signal];
    while (paddedSignal.length < N) {
      paddedSignal.push(0);
    }
    
    // Apply window function to reduce spectral leakage
    const windowedSignal = applyHannWindow(paddedSignal);
    
    // Apply FFT using custom implementation
    const fftResult = fft(windowedSignal);
    
    // Calculate magnitude from complex numbers
    const magnitudes = fftResult.slice(0, N/2).map(c => 
      Math.sqrt(c.re * c.re + c.im * c.im) / (N/2)
    );
    
    // Generate frequency bins (x-axis values)
    const frequencies = Array.from({length: N/2}, (_, i) => 
      i * samplingFreq / N
    );
    
    // Find dominant frequency (peak in spectrum)
    let maxIndex = 0;
    let maxMagnitude = 0;
    
    for (let i = 1; i < magnitudes.length; i++) {
      if (magnitudes[i] > maxMagnitude) {
        maxMagnitude = magnitudes[i];
        maxIndex = i;
      }
    }
    
    // Get the dominant frequency
    const dominantFreq = frequencies[maxIndex];
    
    // Calculate bandwidth
    const bandwidth = calculateBandwidth(magnitudes, frequencies, maxIndex);
    
    // Calculate frequency over time for time-series analysis
    const frequencyTimeSeries = calculateFrequencyTimeSeries(signal, samplingFreq);
    
    return {
      frequencies,
      magnitudes,
      dominantFreq,
      bandwidth,
      peakMagnitude: maxMagnitude,
      frequencyTimeSeries
    };
  } catch (error) {
    console.error('FFT calculation error:', error);
    
    // Fallback to simple frequency estimation
    return simpleFrequencyEstimate(signal, samplingFreq);
  }
}

/**
 * Calculate frequency changes over time by using windowed segments
 * @param {Array<number>} signal - Full signal array
 * @param {number} samplingFreq - Sampling frequency in Hz
 * @returns {Object} Object with time and frequency arrays
 */
function calculateFrequencyTimeSeries(signal, samplingFreq) {
  if (signal.length < 16) {
    return {
      times: [],
      frequencies: []
    };
  }
  
  // Define window size and hop size
  const windowSize = Math.min(32, signal.length / 2);
  const hopSize = Math.max(4, Math.floor(windowSize / 4));
  
  const times = [];
  const frequencies = [];
  
  // Process signal in overlapping windows
  for (let i = 0; i < signal.length - windowSize; i += hopSize) {
    const segment = signal.slice(i, i + windowSize);
    const timePoint = i / samplingFreq; // Time in seconds
    
    // Calculate frequency for this segment
    const result = simpleFrequencyEstimate(segment, samplingFreq);
    
    times.push(timePoint);
    frequencies.push(result.dominantFreq);
  }
  
  return {
    times,
    frequencies
  };
}

/**
 * Simple frequency estimation for very small datasets
 * @param {Array<number>} signal - Array of signal values
 * @param {number} samplingFreq - Sampling frequency in Hz
 * @returns {Object} Object containing estimated frequency data
 */
function simpleFrequencyEstimate(signal, samplingFreq) {
  if (signal.length < 2) {
    return {
      frequencies: [0],
      magnitudes: [0],
      dominantFreq: 0,
      bandwidth: 0,
      peakMagnitude: 0
    };
  }
  
  // Find zero crossings or direction changes
  let crossings = 0;
  let lastDirection = 0;
  
  for (let i = 1; i < signal.length; i++) {
    const diff = signal[i] - signal[i-1];
    if (diff !== 0) {
      const direction = diff > 0 ? 1 : -1;
      if (lastDirection !== 0 && direction !== lastDirection) {
        crossings++;
      }
      lastDirection = direction;
    }
  }
  
  // Calculate peak amplitude
  const peakMagnitude = Math.max(...signal.map(Math.abs));
  
  // Estimate frequency from direction changes
  const totalTime = (signal.length - 1) / samplingFreq;
  const estimatedFreq = crossings > 0 ? (crossings / 2) / totalTime : 0;
  
  // Generate simple synthetic frequency spectrum
  const frequencies = [estimatedFreq];
  const magnitudes = [peakMagnitude];
  
  return {
    frequencies,
    magnitudes,
    dominantFreq: estimatedFreq,
    bandwidth: 0.5,  // Default value
    peakMagnitude
  };
}

/**
 * Apply a Hann window function to the signal to reduce spectral leakage
 * @param {Array<number>} signal - Input signal
 * @returns {Array<number>} Windowed signal
 */
function applyHannWindow(signal) {
  const N = signal.length;
  return signal.map((x, i) => x * 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))));
}

/**
 * Get the next power of 2 greater than or equal to n
 * @param {number} n - Input number
 * @returns {number} Next power of 2
 */
function nextPowerOf2(n) {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Calculate Q factor from frequency spectrum
 * @param {Array<number>} magnitudes - Magnitude array
 * @param {Array<number>} frequencies - Frequency array
 * @param {number} peakIndex - Index of peak frequency
 * @returns {number} Q factor value
 */
export function calculateQFactor(magnitudes, frequencies, peakFrequency) {
  // Default Q factor if data is insufficient
  if (magnitudes.length < 3 || frequencies.length < 3) {
    return 1.0;  // Default value for minimal damping
  }
  
  // Find the closest index for the peak frequency
  let peakIndex = 0;
  let minDiff = Infinity;
  for (let i = 0; i < frequencies.length; i++) {
    const diff = Math.abs(frequencies[i] - peakFrequency);
    if (diff < minDiff) {
      minDiff = diff;
      peakIndex = i;
    }
  }
  
  // Get peak magnitude
  const peakMagnitude = magnitudes[peakIndex];
  if (peakMagnitude <= 0) return 1.0;
  
  // Find half-power points (where magnitude = peak/√2)
  const halfPowerMag = peakMagnitude / Math.SQRT2;
  
  // Find half-power points on either side of peak
  let lowerIndex = peakIndex;
  while (lowerIndex > 0 && magnitudes[lowerIndex] > halfPowerMag) {
    lowerIndex--;
  }
  
  let upperIndex = peakIndex;
  while (upperIndex < magnitudes.length - 1 && magnitudes[upperIndex] > halfPowerMag) {
    upperIndex++;
  }
  
  // If we couldn't find valid bandwidth points, use an estimate
  if (lowerIndex === 0 || upperIndex === magnitudes.length - 1) {
    return 5.0; // Default Q factor for sharp resonance
  }
  
  // Linear interpolation to find more precise half-power frequencies
  const f1 = linearInterpolate(
    frequencies[lowerIndex], 
    frequencies[lowerIndex + 1],
    magnitudes[lowerIndex], 
    magnitudes[lowerIndex + 1],
    halfPowerMag
  );
  
  const f2 = linearInterpolate(
    frequencies[upperIndex - 1],
    frequencies[upperIndex],
    magnitudes[upperIndex - 1],
    magnitudes[upperIndex],
    halfPowerMag
  );
  
  // Calculate bandwidth and Q factor
  const bandwidth = f2 - f1;
  if (bandwidth <= 0 || !isFinite(bandwidth)) return 5.0;
  
  const centerFreq = frequencies[peakIndex];
  const q = centerFreq / bandwidth;
  
  // Limit Q factor to reasonable range
  return Math.min(Math.max(q, 0.1), 50);
}

/**
 * Linear interpolation helper
 * @param {number} x0 - First x value
 * @param {number} x1 - Second x value
 * @param {number} y0 - First y value
 * @param {number} y1 - Second y value
 * @param {number} y - Y value to find x for
 * @returns {number} Interpolated x value
 */
function linearInterpolate(x0, x1, y0, y1, y) {
  if (y1 === y0) return x0;  // Avoid division by zero
  return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
}

/**
 * Calculate bandwidth from magnitude spectrum
 * @param {Array<number>} magnitudes - Magnitude array
 * @param {Array<number>} frequencies - Frequency array
 * @param {number} peakIndex - Index of peak frequency
 * @returns {number} Bandwidth in Hz
 */
function calculateBandwidth(magnitudes, frequencies, peakIndex) {
  if (magnitudes.length < 3 || frequencies.length < 3) {
    return 1.0; // Default bandwidth
  }
  
  const peakMagnitude = magnitudes[peakIndex];
  const halfPowerMag = peakMagnitude / Math.SQRT2;
  
  // Find half-power points on either side of peak
  let lowerIndex = peakIndex;
  while (lowerIndex > 0 && magnitudes[lowerIndex] > halfPowerMag) {
    lowerIndex--;
  }
  
  let upperIndex = peakIndex;
  while (upperIndex < magnitudes.length - 1 && magnitudes[upperIndex] > halfPowerMag) {
    upperIndex++;
  }
  
  // Calculate bandwidth
  const bandwidth = frequencies[upperIndex] - frequencies[lowerIndex];
  return bandwidth > 0 ? bandwidth : 1.0;
}

/**
 * Fast Fourier Transform implementation
 * @param {Array<number>} signal - Input signal (real values)
 * @returns {Array<Object>} Array of complex numbers with re and im properties
 */
function fft(signal) {
  const N = signal.length;
  
  // Base case
  if (N <= 1) {
    return [{re: signal[0] || 0, im: 0}];
  }
  
  // Check if N is a power of 2
  if (N & (N - 1)) {
    throw new Error('Signal length must be a power of 2');
  }
  
  // Split signal into even and odd indexed elements
  const even = [];
  const odd = [];
  for (let i = 0; i < N; i += 2) {
    even.push(signal[i]);
    if (i + 1 < N) {
      odd.push(signal[i + 1]);
    }
  }
  
  // Recursive FFT on even and odd parts
  const evenFFT = fft(even);
  const oddFFT = fft(odd);
  
  // Combine results
  const result = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const twiddle = {
      re: Math.cos(angle),
      im: Math.sin(angle)
    };
    
    // Complex multiplication: twiddle * oddFFT[k]
    const oddTerm = {
      re: twiddle.re * oddFFT[k].re - twiddle.im * oddFFT[k].im,
      im: twiddle.re * oddFFT[k].im + twiddle.im * oddFFT[k].re
    };
    
    // First half: evenFFT[k] + oddTerm
    result[k] = {
      re: evenFFT[k].re + oddTerm.re,
      im: evenFFT[k].im + oddTerm.im
    };
    
    // Second half: evenFFT[k] - oddTerm
    result[k + N/2] = {
      re: evenFFT[k].re - oddTerm.re,
      im: evenFFT[k].im - oddTerm.im
    };
  }
  
  return result;
}
