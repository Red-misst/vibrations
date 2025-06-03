/**
 * Z-Axis Vibration Monitor
 * Natural Frequency Analysis Formulas and Calculations
 * 
 * This file contains implementations of key mechanical vibration formulas
 * focused on natural frequency detection and analysis.
 */

/**
 * Calculate natural frequency from stiffness and mass
 * fn = (1/2π) * sqrt(k/m)
 * @param {number} k - Stiffness (N/m)
 * @param {number} m - Mass (kg)
 * @returns {number} Natural frequency in Hz
 */
function naturalFrequency(k, m) {
  return (1 / (2 * Math.PI)) * Math.sqrt(k / m);
}

/**
 * Calculate Q factor (quality factor) from bandwidth
 * Q = fn / BW
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} bandwidth - Half-power bandwidth (Hz)
 * @returns {number} Q factor
 */
function qFactor(fn, bandwidth) {
  return bandwidth > 0 ? fn / bandwidth : 0;
}

/**
 * Calculate bandwidth from Q factor and natural frequency
 * BW = fn / Q
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} q - Q factor
 * @returns {number} Bandwidth (Hz)
 */
function bandwidth(fn, q) {
  return q > 0 ? fn / q : 0;
}

/**
 * Calculate frequency response magnitude at a given frequency
 * |H(jω)| = Q / √((Q²(1-r²))² + 1)
 * where r = ω/ωn = f/fn (frequency ratio)
 * @param {number} f - Input frequency (Hz)
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} q - Q factor
 * @returns {number} Magnification factor
 */
function frequencyResponse(f, fn, q) {
  const r = f / fn; // frequency ratio
  return q / Math.sqrt(Math.pow(q*q*(1 - r*r), 2) + 1);
}

/**
 * Calculate RMS (Root Mean Square) of a signal
 * RMS = sqrt(1/N * Σ(x²))
 * @param {Array<number>} signal - Array of signal values
 * @returns {number} RMS value
 */
function calculateRMS(signal) {
  if (signal.length === 0) return 0;
  
  const sumOfSquares = signal.reduce((sum, x) => sum + x*x, 0);
  return Math.sqrt(sumOfSquares / signal.length);
}

/**
 * Calculate crest factor of a signal
 * CF = |x|peak / xRMS
 * @param {Array<number>} signal - Array of signal values
 * @returns {number} Crest factor
 */
function crestFactor(signal) {
  if (signal.length === 0) return 0;
  
  const rms = calculateRMS(signal);
  if (rms === 0) return 0;
  
  const peak = Math.max(...signal.map(Math.abs));
  return peak / rms;
}

/**
 * Find peaks in a signal - NO THRESHOLD REQUIRED
 * @param {Array<number>} signal - Array of signal values
 * @param {number} threshold - Minimum peak height (default 0 for ANY peak)
 * @returns {Array<Object>} Array of peak objects with index and value
 */
function findPeaks(signal, threshold = 0) {
  const peaks = [];
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i-1] && 
        signal[i] > signal[i+1] && 
        signal[i] >= threshold) { // Changed to >= to include zero threshold
      peaks.push({
        index: i,
        value: signal[i]
      });
    }
  }
  
  return peaks;
}

/**
 * Estimate natural frequency from peak detection - WORKS WITH ANY SIGNAL
 * @param {Array<number>} signal - Array of signal values
 * @param {number} sampleRate - Sampling rate in Hz
 * @returns {number} Estimated natural frequency in Hz
 */
function estimateNaturalFrequency(signal, sampleRate) {
  if (signal.length < 2) return 0;
  
  const peaks = findPeaks(signal, 0); // No threshold - analyze ANY peaks
  
  if (peaks.length < 2) {
    // If no clear peaks, estimate from signal changes
    let changes = 0;
    for (let i = 1; i < signal.length; i++) {
      if (Math.abs(signal[i] - signal[i-1]) > 0) {
        changes++;
      }
    }
    
    if (changes === 0) return 0;
    
    const totalTime = (signal.length - 1) / sampleRate;
    return changes / (2 * totalTime); // Rough frequency estimate
  }
  
  // Calculate average time between peaks
  let totalPeriod = 0;
  let periodCount = 0;
  
  for (let i = 0; i < peaks.length - 1; i++) {
    const period = (peaks[i+1].index - peaks[i].index) / sampleRate;
    totalPeriod += period;
    periodCount++;
  }
  
  if (periodCount === 0) return 0;
  
  const avgPeriod = totalPeriod / periodCount;
  return 1 / avgPeriod; // frequency = 1/period
}

/**
 * Calculate stiffness from natural frequency and mass
 * k = m * (2πfn)²
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} m - Mass (kg)
 * @returns {number} Stiffness (N/m)
 */
function calculateStiffness(fn, m) {
  const omega = 2 * Math.PI * fn;
  return m * omega * omega;
}

/**
 * Calculate natural period from frequency
 * Tn = 1/fn
 * @param {number} fn - Natural frequency (Hz)
 * @returns {number} Natural period (seconds)
 */
function naturalPeriod(fn) {
  return fn > 0 ? 1 / fn : 0;
}

// Export all functions for use in other modules
export {
  naturalFrequency,
  qFactor,
  bandwidth,
  frequencyResponse,
  calculateRMS,
  crestFactor,
  generateFrequencyResponseCurve,
  findPeaks,
  estimateNaturalFrequency,
  calculateStiffness,
  naturalPeriod
};

/**
 * ==============================
 * NATURAL FREQUENCY ANALYSIS FORMULAS REFERENCE
 * ==============================
 * 
 * 1. FUNDAMENTAL CONCEPTS:
 * 
 * - Natural Frequency: fn = (1/2π) * √(k/m)
 *   Where k is stiffness and m is mass
 * 
 * - Angular Natural Frequency: ωn = 2πfn = √(k/m)
 * 
 * - Natural Period: Tn = 1/fn = 2π * √(m/k)
 * 
 * - Stiffness: k = m * (2πfn)²
 * 
 * 
 * 2. FREQUENCY RESPONSE:
 * 
 * - Quality Factor: Q = fn / BW
 *   Where BW is the half-power bandwidth
 * 
 * - Bandwidth: BW = fn / Q
 * 
 * - Frequency Response: |H(jω)| = Q / √((Q²(1-r²))² + 1)
 *   Where r = f/fn is the frequency ratio
 * 
 * 
 * 3. SIGNAL ANALYSIS:
 * 
 * - Root Mean Square: RMS = √(1/N * Σ(x²))
 * 
 * - Crest Factor: CF = |x|peak / xRMS
 * 
 * - Peak Detection: Identifies local maxima above threshold
 * 
 * - Period Estimation: T = (time between peaks)
 * 
 * 
 * 4. FREQUENCY DOMAIN:
 * 
 * - Fast Fourier Transform (FFT): Converts time domain to frequency domain
 * 
 * - Power Spectral Density: Shows power distribution across frequencies
 * 
 * - Dominant Frequency: Peak in frequency spectrum
 * 
 * - Harmonic Analysis: Integer multiples of fundamental frequency
 * 
 */
