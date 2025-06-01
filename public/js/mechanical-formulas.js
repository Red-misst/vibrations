/**
 * Z-Axis Vibration Monitor
 * Mechanical Engineering Formulas and Calculations
 * 
 * This file contains implementations of key mechanical vibration formulas
 * used for analyzing vertical (Z-axis) vibrations.
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
 * Calculate damping ratio from damping coefficient, stiffness and mass
 * ζ = c / (2 * sqrt(k*m))
 * @param {number} c - Damping coefficient (Ns/m)
 * @param {number} k - Stiffness (N/m)
 * @param {number} m - Mass (kg)
 * @returns {number} Damping ratio (dimensionless)
 */
function dampingRatio(c, k, m) {
  return c / (2 * Math.sqrt(k * m));
}

/**
 * Calculate damping coefficient from damping ratio, stiffness and mass
 * c = 2 * ζ * sqrt(k*m)
 * @param {number} zeta - Damping ratio
 * @param {number} k - Stiffness (N/m)
 * @param {number} m - Mass (kg)
 * @returns {number} Damping coefficient (Ns/m)
 */
function dampingCoefficient(zeta, k, m) {
  return 2 * zeta * Math.sqrt(k * m);
}

/**
 * Calculate Q factor (quality factor) from damping ratio
 * Q = 1/(2*ζ)
 * @param {number} zeta - Damping ratio
 * @returns {number} Q factor
 */
function qFactor(zeta) {
  return 1 / (2 * zeta);
}

/**
 * Calculate logarithmic decrement from successive peak amplitudes
 * δ = (1/n) * ln(x₁/x₍ₙ₊₁₎)
 * @param {number} x1 - First peak amplitude
 * @param {number} xn1 - Peak amplitude n cycles later
 * @param {number} n - Number of cycles between peaks
 * @returns {number} Logarithmic decrement
 */
function logDecrement(x1, xn1, n = 1) {
  return (1/n) * Math.log(Math.abs(x1) / Math.abs(xn1));
}

/**
 * Calculate damping ratio from logarithmic decrement
 * ζ = δ/√(4π² + δ²)
 * @param {number} delta - Logarithmic decrement
 * @returns {number} Damping ratio
 */
function dampingRatioFromLogDecrement(delta) {
  return delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta);
}

/**
 * Calculate frequency response magnitude at a given frequency
 * X/F = 1/k / √((1-r²)² + (2ζr)²)
 * where r = ω/ωn = f/fn (frequency ratio)
 * @param {number} f - Input frequency (Hz)
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} zeta - Damping ratio
 * @returns {number} Magnification factor
 */
function frequencyResponse(f, fn, zeta) {
  const r = f / fn; // frequency ratio
  return 1 / Math.sqrt(Math.pow(1 - r*r, 2) + Math.pow(2*zeta*r, 2));
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
 * Calculate bandwidth from natural frequency and damping ratio
 * BW = 2 * ζ * fn
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} zeta - Damping ratio
 * @returns {number} Bandwidth (Hz)
 */
function bandwidth(fn, zeta) {
  return 2 * zeta * fn;
}

/**
 * Generate frequency response curve data
 * @param {number} fn - Natural frequency (Hz)
 * @param {number} zeta - Damping ratio
 * @param {number} fMin - Minimum frequency for plot (Hz)
 * @param {number} fMax - Maximum frequency for plot (Hz)
 * @param {number} points - Number of points in curve
 * @returns {Object} Object with frequencies and amplitudes arrays
 */
function generateFrequencyResponseCurve(fn, zeta, fMin = 0, fMax = 0, points = 100) {
  if (fMin === 0) fMin = Math.max(0.1, fn * 0.1);
  if (fMax === 0) fMax = fn * 3;
  
  const frequencies = [];
  const amplitudes = [];
  
  const step = (fMax - fMin) / (points - 1);
  
  for (let i = 0; i < points; i++) {
    const f = fMin + i * step;
    frequencies.push(f.toFixed(2));
    amplitudes.push(frequencyResponse(f, fn, zeta));
  }
  
  return { frequencies, amplitudes };
}

/**
 * Find peaks in a signal
 * @param {Array<number>} signal - Array of signal values
 * @param {number} threshold - Minimum peak height
 * @returns {Array<Object>} Array of peak objects with index and value
 */
function findPeaks(signal, threshold = 0) {
  const peaks = [];
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i-1] && 
        signal[i] > signal[i+1] && 
        signal[i] > threshold) {
      peaks.push({
        index: i,
        value: signal[i]
      });
    }
  }
  
  return peaks;
}

/**
 * Estimate natural frequency from peak detection
 * @param {Array<number>} signal - Array of signal values
 * @param {number} sampleRate - Sampling rate in Hz
 * @returns {number} Estimated natural frequency in Hz
 */
function estimateNaturalFrequency(signal, sampleRate) {
  const peaks = findPeaks(signal);
  
  if (peaks.length < 2) return 0;
  
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

// Export all functions for use in other modules
export {
  naturalFrequency,
  dampingRatio,
  dampingCoefficient,
  qFactor,
  logDecrement,
  dampingRatioFromLogDecrement,
  frequencyResponse,
  calculateRMS,
  crestFactor,
  bandwidth,
  generateFrequencyResponseCurve,
  findPeaks,
  estimateNaturalFrequency
};

/**
 * ==============================
 * MECHANICAL ENGINEERING VIBRATION FORMULAS REFERENCE
 * ==============================
 * 
 * 1. BASIC CONCEPTS:
 * 
 * - Natural Frequency: fn = (1/2π) * √(k/m)
 *   Where k is stiffness and m is mass
 * 
 * - Angular Natural Frequency: ωn = 2πfn = √(k/m)
 * 
 * - Natural Period: Tn = 1/fn = 2π * √(m/k)
 * 
 * - Damping Ratio: ζ = c / (2 * √(km))
 *   Where c is damping coefficient
 * 
 * - Critical Damping: cc = 2 * √(km)
 * 
 * 
 * 2. SYSTEM CLASSIFICATION:
 * 
 * - Underdamped: ζ < 1
 *   System oscillates with decreasing amplitude
 * 
 * - Critically Damped: ζ = 1
 *   System returns to equilibrium without oscillation in minimal time
 * 
 * - Overdamped: ζ > 1
 *   System returns to equilibrium without oscillation but slower
 * 
 * 
 * 3. VIBRATION ANALYSIS:
 * 
 * - Logarithmic Decrement: δ = (1/n) * ln(x₁/x₍ₙ₊₁₎)
 *   Where x₁ and x₍ₙ₊₁₎ are amplitudes n cycles apart
 * 
 * - Damping Ratio from Log Decrement: ζ = δ / √(4π² + δ²)
 * 
 * - Q Factor: Q = 1/(2ζ)
 * 
 * - Frequency Response: X/F = 1/k / √((1-r²)² + (2ζr)²)
 *   Where r = ω/ωn = frequency ratio
 * 
 * - Resonance Frequency (damped): ωd = ωn * √(1-ζ²)
 * 
 * - Magnification Factor at Resonance: MF = 1/(2ζ√(1-ζ²))
 * 
 * 
 * 4. SIGNAL PROCESSING METRICS:
 * 
 * - Root Mean Square: RMS = √(1/N * Σ(x²))
 * 
 * - Crest Factor: CF = |x|peak / xRMS
 * 
 * - Kurtosis: K = (1/N) * Σ((x-μ)⁴) / σ⁴
 *   (Measures "peakedness" of probability distribution)
 * 
 * - Power Spectral Density (PSD): Shows distribution of power across frequencies
 * 
 * 
 * 5. BANDWIDTH:
 * 
 * - Half-Power Bandwidth: BW = 2 * ζ * ωn
 * 
 * - Quality Factor from Bandwidth: Q = ωn / BW
 * 
 */
