/**
 * Z-Axis Vibration Monitor - Main Application JavaScript
 * Handles real-time vibration data visualization and WebSocket communication
 */

// Global variables
let socket;
let rawZChart, deltaZChart, frequencyChart;
let currentSession = null;
let isRecording = false;
let dataPointCount = 0;
let connectedDevices = new Set();
let viewingHistoricalSession = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const debugMode = true;

// Helper function for debugging
function debug(message, data) {
    if (debugMode) {
        if (data) {
            console.log(`[DEBUG] ${message}`, data);
        } else {
            console.log(`[DEBUG] ${message}`);
        }
    }
}

// Initialize charts
function initializeCharts() {
    // Raw Z Chart
    const rawZCtx = document.getElementById('rawZChart').getContext('2d');
    rawZChart = new Chart(rawZCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Raw Z-axis (g)',
                data: [],
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        maxRotation: 0
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgb(156, 163, 175)'
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    }
                }
            }
        }
    });
    
    // Delta Z Chart
    const deltaZCtx = document.getElementById('deltaZChart').getContext('2d');
    deltaZChart = new Chart(deltaZCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Delta Z-axis (g)',
                data: [],
                borderColor: 'rgb(139, 92, 246)',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        maxRotation: 0
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    }
                },
                y: {
                    ticks: {
                        color: 'rgb(156, 163, 175)'
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    }
                }
            }
        }
    });
    
    // Frequency Chart
    const frequencyCtx = document.getElementById('frequencyChart').getContext('2d');
    frequencyChart = new Chart(frequencyCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Frequency Amplitude',
                data: [],
                borderColor: 'rgb(74, 222, 128)',
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                borderWidth: 2,
                pointRadius: 1,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                    labels: {
                        color: 'rgb(156, 163, 175)'
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label + ' Hz';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Frequency (Hz)',
                        color: 'rgb(156, 163, 175)'
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)',
                        maxRotation: 0,
                        minRotation: 0
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Amplitude',
                        color: 'rgb(156, 163, 175)'
                    },
                    ticks: {
                        color: 'rgb(156, 163, 175)'
                    },
                    grid: {
                        color: 'rgba(75, 85, 99, 0.2)'
                    },
                    beginAtZero: true
                }
            }
        }
    });    // Frequency Time Series Chart
    const frequencyTimeCtx = document.getElementById('frequencyTimeChart')?.getContext('2d');
    if (frequencyTimeCtx) {
        window.frequencyTimeChart = new Chart(frequencyTimeCtx, {
            type: 'line',
            data: {
                labels: [],                datasets: [{
                    label: 'Dynamic Frequency (Hz)',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time',
                            color: 'rgb(156, 163, 175)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)',
                            maxRotation: 0
                        },
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Frequency (Hz)',
                            color: 'rgb(156, 163, 175)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)'
                        },
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // Amplitude Time Series Chart
    const amplitudeTimeCtx = document.getElementById('amplitudeTimeChart')?.getContext('2d');
    if (amplitudeTimeCtx) {
        window.amplitudeTimeChart = new Chart(amplitudeTimeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Amplitude',
                    data: [],
                    borderColor: 'rgb(139, 92, 246)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 1,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time',
                            color: 'rgb(156, 163, 175)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)',
                            maxRotation: 0
                        },
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Amplitude',
                            color: 'rgb(156, 163, 175)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)'
                        },
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    debug("Charts initialized successfully");
}

// WebSocket connection to server - more robust connection handling for production
function connectWebSocket() {
    // Close existing connection if any
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // Use different approaches for connecting based on environment
    let wsUrl = `${protocol}//${host}/web`;
    
    // Add a client identifier to help server route the connection
    wsUrl += wsUrl.includes('?') ? '&client=true' : '?client=true';
    
    debug(`Attempting WebSocket connection to: ${wsUrl}`);
    
    // Create new WebSocket with proper error handling
    try {
        socket = new WebSocket(wsUrl);
        
        socket.addEventListener('open', () => {
            updateConnectionStatus('connected');
            reconnectAttempts = 0; // Reset reconnect counter on successful connection
            debug('Connected to WebSocket server');
            
            // Request current device list when connected
            socket.send(JSON.stringify({
                type: 'get_device_list'
            }));
            
            // Request session list
            socket.send(JSON.stringify({
                type: 'get_sessions'
            }));
        });

        socket.addEventListener('close', (event) => {
            updateConnectionStatus('disconnected');
            debug(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
            
            // Implement exponential backoff for reconnection
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                reconnectAttempts++;
                
                debug(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts} of ${maxReconnectAttempts})`);
                setTimeout(connectWebSocket, delay);
            } else {
                showNotification("Connection lost. Please refresh the page.", "error");
            }
        });

        socket.addEventListener('error', (error) => {
            updateConnectionStatus('error');
            debug('WebSocket error:', error);
        });

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                debug('Error parsing message:', error);
            }
        });
    } catch (error) {
        debug('Error creating WebSocket:', error);
        showNotification("Failed to connect to server. Will retry shortly.", "error");
        
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
    }
}

function handleWebSocketMessage(data) {
    debug(`Received WebSocket message: ${data.type}`);
    
    switch (data.type) {
        case 'vibration_data':
            updateVibrationData(data);
            break;
        case 'session_status':
            updateSessionStatus(data);
            break;
        case 'device_status':
            updateDeviceStatus(data);
            break;
        case 'device_list':
            if (data.devices && data.devices.length > 0) {
                connectedDevices = new Set(data.devices);
                updateDeviceDisplay();
            }
            break;
        case 'test_started':
            onTestStarted(data);
            break;
        case 'test_stopped':
            onTestStopped(data);
            break;
        case 'sessions_list':
            updateSessionsList(data.sessions);
            break;
        case 'frequency_data':
            updateResonanceData(data);
            break;
        case 'session_deleted':
            onSessionDeleted(data);
            break;
        case 'session_data':
            // Handle historical session data
            handleSessionData(data);
            break;
        case 'error':
            showNotification(`Error: ${data.message}`, "error");
            break;
    }
}

// New function for handling historical session data
function handleSessionData(data) {
    debug("Handling historical session data", data);
    viewingHistoricalSession = true;
    
    // Clear current charts
    clearCharts();
    
    if (data.data && data.data.length > 0) {
        // Set the data point count
        dataPointCount = data.data.length;
        document.getElementById('dataPointCount').textContent = dataPointCount;
        
        // Process the time series data
        const timestamps = [];
        const rawZValues = [];
        const deltaZValues = [];
        
        data.data.forEach(point => {
            // Get time from timestamp or use receivedAt
            let timeLabel;
            if (point.timestamp) {
                timeLabel = new Date(parseInt(point.timestamp)).toLocaleTimeString();
            } else {
                timeLabel = new Date(point.receivedAt).toLocaleTimeString();
            }
            
            timestamps.push(timeLabel);
            rawZValues.push(point.rawZ);
            deltaZValues.push(point.deltaZ);
        });
        
        // Update the charts
        rawZChart.data.labels = timestamps;
        rawZChart.data.datasets[0].data = rawZValues;
        deltaZChart.data.labels = timestamps;
        deltaZChart.data.datasets[0].data = deltaZValues;
        
        // Take a sample of data points for display if there are too many
        if (timestamps.length > 50) {
            const skipFactor = Math.ceil(timestamps.length / 50);
            rawZChart.data.labels = timestamps.filter((_, i) => i % skipFactor === 0);
            rawZChart.data.datasets[0].data = rawZValues.filter((_, i) => i % skipFactor === 0);
            deltaZChart.data.labels = timestamps.filter((_, i) => i % skipFactor === 0);
            deltaZChart.data.datasets[0].data = deltaZValues.filter((_, i) => i % skipFactor === 0);
        }
        
        // Update charts
        rawZChart.update();
        deltaZChart.update();
        
        // Update the metrics with frequency data
        if (data.frequencyData) {
            debug("Processing frequency data", data.frequencyData);
            
            // Update frequency metric
            if (data.frequencyData.naturalFrequency) {
                document.getElementById('frequencyValue').textContent = data.frequencyData.naturalFrequency.toFixed(2);
            }
            
            // Update Q Factor metric
            if (data.frequencyData.qFactor) {
                document.getElementById('qFactorValue').textContent = data.frequencyData.qFactor.toFixed(1);
            }
            
            // Update peak amplitude metric
            if (data.frequencyData.peakAmplitude) {
                document.getElementById('amplitudeValue').textContent = data.frequencyData.peakAmplitude.toFixed(3);
            }
            
            // Update current Z value with last data point
            const lastDeltaZ = data.data[data.data.length - 1].deltaZ;
            document.getElementById('currentZValue').textContent = lastDeltaZ.toFixed(3);
              // Generate frequency domain data for the natural frequency chart
            generateFrequencyResponseData(data.frequencyData);
            
            // Process frequency and amplitude time series if available
            if (window.frequencyTimeChart && window.amplitudeTimeChart) {
                debug("Updating frequency and amplitude time series charts");
                
                // Check if we have frequency time series from the TestSession data
                if (data.frequencyData.frequencyTimeSeries && data.frequencyData.frequencyTimeSeries.length > 0) {
                    const freqTimeLabels = data.frequencyData.frequencyTimeSeries.map(point => {
                        return new Date(parseInt(point.timestamp) || Date.now()).toLocaleTimeString();
                    });
                    const freqValues = data.frequencyData.frequencyTimeSeries.map(point => point.frequency);
                    
                    window.frequencyTimeChart.data.labels = freqTimeLabels;
                    window.frequencyTimeChart.data.datasets[0].data = freqValues;
                    window.frequencyTimeChart.update();
                } else {
                    // Generate synthetic frequency time series from the historical data
                    const timestamps = [];
                    const frequencies = [];
                    
                    // Use a sliding window approach to calculate frequency over time
                    const windowSize = Math.min(10, Math.floor(data.data.length / 4));
                    if (windowSize >= 3) { // Need at least 3 points for meaningful frequency calculation
                        for (let i = 0; i < data.data.length - windowSize; i += windowSize / 2) {
                            const windowData = data.data.slice(i, i + windowSize);
                            const avgTime = new Date(parseInt(windowData[Math.floor(windowSize/2)].timestamp) || 
                                                     windowData[Math.floor(windowSize/2)].receivedAt).toLocaleTimeString();
                                                       // Calculate frequency for this window using the fftUtils approach
                            // Extract just the deltaZ values for frequency calculation
                            const windowValues = windowData.map(point => point.deltaZ);
                            
                            // Estimate sampling frequency based on timestamps
                            let samplingFreq = 100; // Default value if we can't calculate
                            if (windowData.length > 1) {
                                const firstTime = new Date(parseInt(windowData[0].timestamp) || windowData[0].receivedAt).getTime();
                                const lastTime = new Date(parseInt(windowData[windowData.length-1].timestamp) || windowData[windowData.length-1].receivedAt).getTime();
                                const duration = (lastTime - firstTime) / 1000; // in seconds
                                if (duration > 0) {
                                    samplingFreq = windowData.length / duration;
                                }
                            }
                            
                            // Use zero-crossing approach for simple frequency estimation
                            let crossings = 0;
                            let lastDirection = 0;
                            
                            for (let j = 1; j < windowValues.length; j++) {
                                const diff = windowValues[j] - windowValues[j-1];
                                if (diff !== 0) {
                                    const direction = diff > 0 ? 1 : -1;
                                    if (lastDirection !== 0 && direction !== lastDirection) {
                                        crossings++;
                                    }
                                    lastDirection = direction;
                                }
                            }
                            
                            // Calculate frequency from zero crossings
                            let freq = 0;
                            if (crossings > 0) {
                                // Each full oscillation has 2 crossings
                                const oscillations = crossings / 2;
                                const duration = windowValues.length / samplingFreq;
                                freq = oscillations / duration;
                            } else {
                                // Fallback to the natural frequency if no crossings detected
                                freq = data.frequencyData.naturalFrequency || 0;
                            }
                            
                            timestamps.push(avgTime);
                            frequencies.push(freq);
                        }
                        
                        window.frequencyTimeChart.data.labels = timestamps;
                        window.frequencyTimeChart.data.datasets[0].data = frequencies;
                        window.frequencyTimeChart.update();
                    }
                }
                
                // Check if we have amplitude time series from the TestSession data
                if (data.frequencyData.amplitudeTimeSeries && data.frequencyData.amplitudeTimeSeries.length > 0) {
                    const ampTimeLabels = data.frequencyData.amplitudeTimeSeries.map(point => {
                        return new Date(parseInt(point.timestamp) || Date.now()).toLocaleTimeString();
                    });
                    const ampValues = data.frequencyData.amplitudeTimeSeries.map(point => point.amplitude);
                    
                    window.amplitudeTimeChart.data.labels = ampTimeLabels;
                    window.amplitudeTimeChart.data.datasets[0].data = ampValues;
                    window.amplitudeTimeChart.update();
                } else {
                    // Generate synthetic amplitude time series from the raw data
                    const timeLabels = [];
                    const amplitudes = [];
                    
                    // Use a sliding window approach to calculate amplitude over time
                    const windowSize = Math.min(10, Math.floor(data.data.length / 4));
                    if (windowSize >= 3) {
                        for (let i = 0; i < data.data.length - windowSize; i += windowSize / 2) {
                            const windowData = data.data.slice(i, i + windowSize);
                            const avgTime = new Date(parseInt(windowData[Math.floor(windowSize/2)].timestamp) || 
                                                     windowData[Math.floor(windowSize/2)].receivedAt).toLocaleTimeString();
                                                     
                            // Calculate peak amplitude in this window
                            const peakAmplitude = Math.max(...windowData.map(d => Math.abs(d.deltaZ)));
                            
                            timeLabels.push(avgTime);
                            amplitudes.push(peakAmplitude);
                        }
                        
                        window.amplitudeTimeChart.data.labels = timeLabels;
                        window.amplitudeTimeChart.data.datasets[0].data = amplitudes;
                        window.amplitudeTimeChart.update();
                    }
                }
            }
        }
        
        showNotification("Historical session data loaded successfully", "success");
    } else {
        showNotification("No data available for this session", "error");
    }
}

// Fixed function to generate frequency response data with better error handling
function generateFrequencyResponseData(frequencyData) {
    if (!frequencyData) {
        debug("No frequency data available");
        return;
    }
    
    // Check if we have frequency data directly from the server
    if (frequencyData.frequencies && frequencyData.magnitudes && 
        frequencyData.frequencies.length > 0 && frequencyData.magnitudes.length > 0) {
        
        debug("Using server-provided frequency data");
        
        try {
            // Use the provided frequency and magnitude data
            frequencyChart.data.labels = [...frequencyData.frequencies];
            frequencyChart.data.datasets[0].data = [...frequencyData.magnitudes];
            frequencyChart.update();
        } catch (error) {
            debug("Error updating frequency chart with server data:", error);
        }
        return;
    }
    
    // Fallback: Generate synthetic frequency response curve if actual data isn't available
    debug("Generating synthetic frequency response curve");
    
    const fn = frequencyData.naturalFrequency || 1; // Default to 1 Hz if undefined
    const damping = frequencyData.qFactor ? (1 / (2 * frequencyData.qFactor)) : 0.05;
    
    // Generate points along a frequency response curve
    const freqMin = Math.max(0.1, fn * 0.1);
    const freqMax = fn * 3;
    const numPoints = 100;
    const step = (freqMax - freqMin) / (numPoints - 1);
    
    const frequencies = [];
    const amplitudes = [];
    
    for (let i = 0; i < numPoints; i++) {
        const f = freqMin + (step * i);
        frequencies.push(f.toFixed(2));
        
        // Calculate amplitude using frequency response formula for a damped oscillator
        const r = f / fn; // frequency ratio
        const amplitude = 1 / Math.sqrt(Math.pow(1 - r*r, 2) + Math.pow(2*damping*r, 2));
        amplitudes.push(amplitude);
    }
    
    try {
        frequencyChart.data.labels = frequencies;
        frequencyChart.data.datasets[0].data = amplitudes;
        frequencyChart.update();
        debug("Frequency chart updated with synthetic points:", frequencies.length);
    } catch (error) {
        debug("Error updating frequency chart with synthetic data:", error);
    }
}

function updateVibrationData(data) {
    dataPointCount++;
    document.getElementById('dataPointCount').textContent = dataPointCount;

    // Update real-time metrics for ANY vibration magnitude
    if (data.frequency !== undefined) {
        document.getElementById('frequencyValue').textContent = data.frequency.toFixed(2);
    }
    if (data.qFactor !== undefined) {
        document.getElementById('qFactorValue').textContent = data.qFactor.toFixed(1);
    }
    if (data.amplitude !== undefined) {
        document.getElementById('amplitudeValue').textContent = data.amplitude.toFixed(3);
    }
    if (data.deltaZ !== undefined) {
        document.getElementById('currentZValue').textContent = data.deltaZ.toFixed(3);
    }

    // Format time for display on chart
    let timestamp;
    if (data.timestamp) {
        // Convert timestamp to date if it's a number
        const time = typeof data.timestamp === 'number' ? new Date(data.timestamp) : new Date();
        timestamp = time.toLocaleTimeString();
    } else {
        timestamp = new Date().toLocaleTimeString();
    }
    
    // Safely update charts with null checks
    try {
        // Add data to raw Z-axis chart - NO THRESHOLD FILTERING
        rawZChart.data.labels.push(timestamp);
        rawZChart.data.datasets[0].data.push(data.rawZ || 0);

        // Add data to delta Z-axis chart - NO THRESHOLD FILTERING
        deltaZChart.data.labels.push(timestamp);
        deltaZChart.data.datasets[0].data.push(data.deltaZ || 0);

        // Keep only last 50 data points
        const maxPoints = 50;
        if (rawZChart.data.labels.length > maxPoints) {
            rawZChart.data.labels.shift();
            rawZChart.data.datasets[0].data.shift();
            deltaZChart.data.labels.shift();
            deltaZChart.data.datasets[0].data.shift();
        }        rawZChart.update('none');
        deltaZChart.update('none');
          // Update frequency and amplitude time series with dynamic frequency calculation
        if (!viewingHistoricalSession && 
            window.frequencyTimeChart && window.amplitudeTimeChart) {
            
            // Calculate frequency from recent data points instead of using a fixed value
            // This provides a more dynamic view of frequency changes
            
            // Store the most recent data points for frequency calculation
            if (!window.recentDataPoints) {
                window.recentDataPoints = [];
            }
            
            // Add current data point to recent points array
            window.recentDataPoints.push({
                deltaZ: data.deltaZ || 0,
                timestamp: Date.now()
            });
            
            // Keep only last 10 data points for frequency calculation
            if (window.recentDataPoints.length > 10) {
                window.recentDataPoints.shift();
            }
            
            // Calculate frequency from recent data points
            let calculatedFreq = 0;
            
            if (window.recentDataPoints.length >= 3) {
                // Extract deltaZ values
                const values = window.recentDataPoints.map(p => p.deltaZ);
                
                // Calculate sampling frequency
                const firstTime = window.recentDataPoints[0].timestamp;
                const lastTime = window.recentDataPoints[window.recentDataPoints.length-1].timestamp;
                const duration = (lastTime - firstTime) / 1000; // in seconds
                const samplingFreq = duration > 0 ? window.recentDataPoints.length / duration : 100;
                
                // Count zero-crossings for frequency estimation
                let crossings = 0;
                let lastDirection = 0;
                
                for (let i = 1; i < values.length; i++) {
                    const diff = values[i] - values[i-1];
                    if (diff !== 0) {
                        const direction = diff > 0 ? 1 : -1;
                        if (lastDirection !== 0 && direction !== lastDirection) {
                            crossings++;
                        }
                        lastDirection = direction;
                    }
                }
                
                // Calculate frequency from zero crossings
                if (crossings > 0) {
                    // Each full oscillation has 2 crossings
                    const oscillations = crossings / 2;
                    calculatedFreq = oscillations / (duration || 0.1);
                } else {
                    // If no crossings, use the passed frequency or default to 0
                    calculatedFreq = data.frequency || 0;
                }
            } else {
                calculatedFreq = data.frequency || 0;
            }
            
            // Add data to frequency time chart with our calculated frequency
            window.frequencyTimeChart.data.labels.push(timestamp);
            window.frequencyTimeChart.data.datasets[0].data.push(calculatedFreq);
            
            // Add data to amplitude time chart
            window.amplitudeTimeChart.data.labels.push(timestamp);
            window.amplitudeTimeChart.data.datasets[0].data.push(Math.abs(data.deltaZ) || 0);
            
            // Keep only last 50 data points for time series charts
            if (window.frequencyTimeChart.data.labels.length > 50) {
                window.frequencyTimeChart.data.labels.shift();
                window.frequencyTimeChart.data.datasets[0].data.shift();
            }
            
            if (window.amplitudeTimeChart.data.labels.length > 50) {
                window.amplitudeTimeChart.data.labels.shift();
                window.amplitudeTimeChart.data.datasets[0].data.shift();
            }
            
            // Update the charts with minimal performance impact
            window.frequencyTimeChart.update('none');
            window.amplitudeTimeChart.update('none');
        }
    } catch (error) {
        debug("Error updating vibration charts:", error);
    }
}

function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionIndicator');
    const statusText = document.getElementById('connectionStatus');
    
    indicator.className = 'status-indicator';
    
    switch (status) {
        case 'connected':
            indicator.classList.add('connected');
            statusText.textContent = 'Connected';
            statusText.className = 'ml-2 font-semibold text-green-400';
            break;
        case 'disconnected':
            indicator.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
            statusText.className = 'ml-2 font-semibold text-red-400';
            break;
        case 'error':
            indicator.classList.add('disconnected');
            statusText.textContent = 'Connection Error';
            statusText.className = 'ml-2 font-semibold text-red-400';
            break;
    }
}

function updateSessionStatus(data) {
    currentSession = data.sessionId;
    document.getElementById('sessionId').textContent = data.sessionId || 'None';
    
    if (data.isActive) {
        isRecording = true;
        updateButtonStates(true);
    }
    
    if (data.connectedDevices && data.connectedDevices.length > 0) {
        connectedDevices = new Set(data.connectedDevices);
        updateDeviceDisplay();
    }
}

function updateDeviceStatus(data) {
    debug("Device status update:", data);
    if (data.status === 'connected') {
        connectedDevices.add(data.deviceId);
    } else {
        connectedDevices.delete(data.deviceId);
    }
    updateDeviceDisplay();
}

function updateDeviceDisplay() {
    const deviceIndicator = document.getElementById('deviceIndicator');
    const deviceStatus = document.getElementById('deviceStatus');
    
    deviceIndicator.className = 'status-indicator';
    
    if (connectedDevices.size > 0) {
        deviceIndicator.classList.add(isRecording ? 'recording' : 'connected');
        deviceStatus.textContent = `${connectedDevices.size} device${connectedDevices.size > 1 ? 's' : ''} connected`;
        deviceStatus.className = 'ml-2 font-semibold text-green-400';
        
        // Enable start button if devices are connected
        document.getElementById('startTest').disabled = isRecording;
        document.getElementById('startTest').classList.toggle('opacity-50', isRecording);
        document.getElementById('startSessionBtn').disabled = isRecording;
        document.getElementById('startSessionBtn').classList.toggle('opacity-50', isRecording);
    } else {
        deviceIndicator.classList.add('disconnected');
        deviceStatus.textContent = 'No devices';
        deviceStatus.className = 'ml-2 font-semibold text-red-400';
        
        // Disable start button if no devices
        document.getElementById('startTest').disabled = true;
        document.getElementById('startTest').classList.add('opacity-50');
        document.getElementById('startSessionBtn').disabled = true;
        document.getElementById('startSessionBtn').classList.add('opacity-50');
    }
}

function updateButtonStates(isActive) {
    document.getElementById('startTest').disabled = isActive;
    document.getElementById('startTest').classList.toggle('opacity-50', isActive);
    document.getElementById('stopTest').disabled = !isActive;
    document.getElementById('stopTest').classList.toggle('opacity-50', !isActive);
    document.getElementById('startSessionBtn').disabled = isActive;
    document.getElementById('startSessionBtn').classList.toggle('opacity-50', isActive);
    document.getElementById('sessionName').disabled = isActive;
}

function updateResonanceData(data) {
    // Update frequency chart for ANY frequency data available
    if (data.frequencies && data.magnitudes) {
        debug("Updating frequency chart with data points:", data.frequencies.length);
        frequencyChart.data.labels = data.frequencies;
        frequencyChart.data.datasets[0].data = data.magnitudes;
        frequencyChart.update();
    } else {
        // Generate synthetic data for any detected frequency
        if (data.frequency && data.frequency > 0) {
            generateFrequencyResponseData({
                naturalFrequency: data.frequency,
                qFactor: data.qFactor || 1
            });
        }
    }
    
    // Update frequency time series chart if it exists and we're not viewing historical data
    if (!viewingHistoricalSession && window.frequencyTimeChart && data.frequency) {
        const timestamp = new Date().toLocaleTimeString();
        window.frequencyTimeChart.data.labels.push(timestamp);
        window.frequencyTimeChart.data.datasets[0].data.push(data.frequency);
        
        // Keep only the last 50 points
        if (window.frequencyTimeChart.data.labels.length > 50) {
            window.frequencyTimeChart.data.labels.shift();
            window.frequencyTimeChart.data.datasets[0].data.shift();
        }
        
        window.frequencyTimeChart.update();
    }
    
    // Also update the frequency analysis results table
    if (typeof updateFrequencyAnalysisTable === 'function') {
        updateFrequencyAnalysisTable(data);
    }
}

// New function to update the frequency analysis results table
function updateFrequencyAnalysisTable(data) {
    debug("Updating frequency analysis table", data);
    
    const tableBody = document.getElementById('frequencyAnalysisTableBody');
    tableBody.innerHTML = ''; // Clear existing rows
    
    // Create a row for each frequency data point
    if (data.frequencies && data.magnitudes) {
        for (let i = 0; i < data.frequencies.length; i++) {
            const freq = data.frequencies[i];
            const mag = data.magnitudes[i];
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-3">${freq.toFixed(2)} Hz</td>
                <td class="px-4 py-3">${mag.toFixed(3)}</td>
            `;
            tableBody.appendChild(row);
        }
    } else {
        // Fallback: show estimated frequency and magnitude
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-3">N/A</td>
            <td class="px-4 py-3">N/A</td>
        `;
        tableBody.appendChild(row);
    }
}

function onTestStarted(data) {
    debug("Test started:", data);
    currentSession = data.sessionId;
    isRecording = true;
    dataPointCount = 0;
    document.getElementById('dataPointCount').textContent = '0';
    
    // Update UI buttons
    updateButtonStates(true);
    
    // Clear charts
    clearCharts();
    
    // Update session ID display
    document.getElementById('sessionId').textContent = currentSession || 'None';
    
    // Update device indicator
    updateDeviceDisplay();
}

function onTestStopped(data) {
    debug("Test stopped:", data);
    isRecording = false;
    
    // Update UI buttons
    updateButtonStates(false);
    
    // Show processing indicator
    showNotification("Processing data and calculating resonance...", "info");
    
    // Request updated session list
    socket.send(JSON.stringify({
        type: 'get_sessions'
    }));
    
    updateDeviceDisplay();
}

function clearCharts() {
    rawZChart.data.labels = [];
    rawZChart.data.datasets[0].data = [];
    deltaZChart.data.labels = [];
    deltaZChart.data.datasets[0].data = [];
    frequencyChart.data.labels = [];
    frequencyChart.data.datasets[0].data = [];
    
    rawZChart.update();
    deltaZChart.update();
    frequencyChart.update();
    
    // Also clear frequency and amplitude time series charts if they exist
    if (window.frequencyTimeChart) {
        window.frequencyTimeChart.data.labels = [];
        window.frequencyTimeChart.data.datasets[0].data = [];
        window.frequencyTimeChart.update();
    }
    
    if (window.amplitudeTimeChart) {
        window.amplitudeTimeChart.data.labels = [];
        window.amplitudeTimeChart.data.datasets[0].data = [];
        window.amplitudeTimeChart.update();
    }
}

function updateSessionsList(sessions) {
    const sessionListEl = document.getElementById('sessionList');
    sessionListEl.innerHTML = '';
    
    // Also update chat session selector if available
    if (typeof window.updateChatSessionSelector === 'function') {
        window.updateChatSessionSelector(sessions);
    }
    
    if (!sessions || sessions.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="4" class="px-4 py-3 text-center text-gray-500">No sessions found</td>
        `;
        sessionListEl.appendChild(row);
        return;
    }
    
    sessions.forEach(session => {
        const row = document.createElement('tr');
        
        // Format date
        const startDate = new Date(session.startTime);
        const startTimeStr = startDate.toLocaleString();
        
        // Status badge class
        const statusClass = session.isActive ? 'bg-green-600' : 'bg-blue-600';
        
        row.innerHTML = `
            <td class="px-4 py-3">${session.name}</td>
            <td class="px-4 py-3">${startTimeStr}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs rounded ${statusClass}">
                    ${session.isActive ? 'Active' : 'Completed'}
                </span>
            </td>
            <td class="px-4 py-3 flex space-x-2">
                <button class="text-blue-400 hover:text-blue-300 p-1" onclick="viewSession('${session._id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="text-green-400 hover:text-green-300 p-1" onclick="exportSession('${session._id}')">
                    <i class="fas fa-download"></i>
                </button>
                ${session.isActive ? 
                  `<button class="text-red-400 hover:text-red-300 p-1" onclick="stopSession('${session._id}')">
                      <i class="fas fa-stop"></i>
                   </button>` : 
                  `<button class="text-red-400 hover:text-red-300 p-1" onclick="deleteSession('${session._id}')">
                      <i class="fas fa-trash"></i>
                   </button>`}
            </td>
        `;
        
        sessionListEl.appendChild(row);
    });
}

function onSessionDeleted(data) {
    if (data.success) {
        showNotification("Session deleted successfully", "success");
        
        // Request updated session list
        socket.send(JSON.stringify({
            type: 'get_sessions'
        }));
    } else {
        showNotification("Error deleting session: " + (data.error || "Unknown error"), "error");
    }
}

// Helper functions for session management
function viewSession(sessionId) {
    debug("Viewing session:", sessionId);
    
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showNotification("Connection to server lost. Please refresh the page.", "error");
        return;
    }
    
    showNotification("Loading session data...", "info");
    
    // Find the session name from the sessions list
    const sessionsList = document.querySelectorAll('#sessionList tr');
    let sessionName = 'Unknown Session';
    
    sessionsList.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const buttons = row.querySelectorAll('button');
            buttons.forEach(button => {
                if (button.onclick && button.onclick.toString().includes(sessionId)) {
                    sessionName = cells[0].textContent;
                }
            });
        }
    });
      // Update session data
    socket.send(JSON.stringify({
        type: 'get_session_data',
        sessionId: sessionId
    }));
    
    // Add the session to the chat interface and select it
    if (typeof window.addSessionToChat === 'function') {
        // Find the session object in the session list to get full details
        const sessionRows = document.querySelectorAll('#sessionList tr');
        let sessionObject = { 
            _id: sessionId, 
            name: sessionName,
            createdAt: new Date().toISOString()
        };
        
        // Update the chat interface with this session and select it
        window.addSessionToChat(sessionObject, true);
    }
    
    // Request session data
    socket.send(JSON.stringify({
        type: 'get_session_data',
        sessionId: sessionId
    }));
}

function exportSession(sessionId) {
    window.open(`/api/export/${sessionId}?format=csv`, '_blank');
}

function stopSession(sessionId) {
    if (confirm('Are you sure you want to stop this session?')) {
        socket.send(JSON.stringify({
            type: 'stop_test'
        }));
        
        showNotification("Stopping session...", "info");
    }
}

function deleteSession(sessionId) {
    document.getElementById('deleteSessionId').value = sessionId;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

function confirmDeleteSession() {
    const sessionId = document.getElementById('deleteSessionId').value;
    if (sessionId) {
        socket.send(JSON.stringify({
            type: 'delete_session',
            sessionId: sessionId
        }));
    }
    closeDeleteModal();
}

function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-20 opacity-0';
        document.body.appendChild(notification);
    }
    
    // Set color based on type
    if (type === 'success') {
        notification.className = notification.className.replace(/bg-\w+-\d+/g, '') + ' bg-green-600';
    } else if (type === 'error') {
        notification.className = notification.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-600';
    } else {
        notification.className = notification.className.replace(/bg-\w+-\d+/g, '') + ' bg-blue-600';
    }
    
    // Set message
    notification.textContent = message;
    
    // Show notification
    setTimeout(() => {
        notification.className = notification.className.replace('translate-y-20 opacity-0', '') + ' translate-y-0 opacity-100';
    }, 10);
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.className = notification.className.replace('translate-y-0 opacity-100', '') + ' translate-y-20 opacity-0';
    }, 3000);
}

// Initialize app
window.addEventListener('load', () => {
    try {
        initializeCharts();
        connectWebSocket();
        
        // Debug the frequency chart to ensure it's correctly initialized
        debug("Frequency chart initialized:", frequencyChart ? "Yes" : "No");
        if (frequencyChart) {
            debug("Chart type:", frequencyChart.config.type);
            debug("Canvas:", document.getElementById('frequencyChart') ? "Found" : "Not found");
        }
        
        // Auto-stop test when user navigates away
        window.addEventListener('beforeunload', (e) => {
            if (isRecording && socket && socket.readyState === WebSocket.OPEN) {
                // Send stop test if recording
                socket.send(JSON.stringify({ type: 'stop_test' }));
                
                // Show confirmation dialog to prevent accidental navigation
                const message = 'You have an active recording session. Navigating away will stop the recording.';
                e.returnValue = message;
                return message;
            }
        });
    } catch (error) {
        debug("Error during initialization:", error);
        showNotification("Error initializing application. Please refresh the page.", "error");
    }
});

// Event listeners for buttons
document.getElementById('startTest').addEventListener('click', () => {
    const sessionName = prompt('Enter session name:', 'Z-Axis Test ' + new Date().toLocaleTimeString());
    if (!sessionName) return;
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ 
            type: 'start_test',
            sessionName: sessionName
        }));
    } else {
        showNotification("Connection to server lost. Reconnecting...", "error");
        connectWebSocket();
    }
});

document.getElementById('stopTest').addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'stop_test' }));
    } else {
        showNotification("Connection to server lost. Reconnecting...", "error");
        connectWebSocket();
    }
});

document.getElementById('exportData').addEventListener('click', () => {
    if (!currentSession) {
        alert('No session data available for export.');
        return;
    }
    
    window.open(`/api/export/${currentSession}?format=csv`, '_blank');
});

document.getElementById('startSessionBtn').addEventListener('click', () => {
    const sessionName = document.getElementById('sessionName').value.trim();
    if (!sessionName) {
        alert('Please enter a session name');
        document.getElementById('sessionName').focus();
        return;
    }
    
    // Get the mass value
    const testMass = parseFloat(document.getElementById('testMass').value) || 1.0;
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'start_test',
            sessionName: sessionName,
            testMass: testMass
        }));
        
        // Visual feedback
        const btn = document.getElementById('startSessionBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Starting...';
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-play mr-2"></i>Start New Session';
        }, 1500);
    } else {
        showNotification("Connection to server lost. Reconnecting...", "error");
        connectWebSocket();
    }
});

// Make functions available globally
window.viewSession = viewSession;
window.exportSession = exportSession;
window.stopSession = stopSession;
window.deleteSession = deleteSession;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteSession = confirmDeleteSession;
