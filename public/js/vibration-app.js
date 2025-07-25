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
                    },
                    beginAtZero: true
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

    // Update options for all charts to improve performance
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable animations for better performance
        elements: {
            line: {
                tension: 0.2 // Reduce line tension for better performance
            },
            point: {
                radius: 0 // Hide points for better performance
            }
        },
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 10 // Limit number of ticks for better performance
                }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    maxTicksLimit: 8 // Limit number of ticks for better performance
                }
            }
        }
    };

    // Apply the common options to each chart
    [rawZChart, deltaZChart, frequencyChart].forEach(chart => {
        Object.assign(chart.options, commonOptions);
        chart.update('none');
    });
    
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
        dataPointCount = data.data.length;
        document.getElementById('dataPointCount').textContent = dataPointCount;

        // Process time series data
        const timestamps = [];
        const rawZValues = [];
        const deltaZValues = [];

        // Track metrics
        let maxAmplitude = 0;
        let frequencyAtMaxAmplitude = 0;

        data.data.forEach(point => {
            const timeLabel = new Date(parseInt(point.timestamp) || point.receivedAt).toLocaleTimeString();
            timestamps.push(timeLabel);
            
            const rawZ = point.rawAcceleration || point.rawZ || 0;
            const deltaZ = point.deltaZ || 0;
            
            rawZValues.push(rawZ);
            deltaZValues.push(deltaZ);

            // Update max amplitude and its corresponding frequency
            if (point.amplitude > maxAmplitude) {
                maxAmplitude = point.amplitude;
                frequencyAtMaxAmplitude = point.frequency;
            }
        });

        // Update metrics display
        document.getElementById('frequencyValue').textContent = frequencyAtMaxAmplitude.toFixed(2);
        document.getElementById('amplitudeValue').textContent = maxAmplitude.toFixed(3);
        document.getElementById('currentZValue').textContent = deltaZValues[deltaZValues.length - 1].toFixed(3);

        // Update time-domain charts
        rawZChart.data.labels = timestamps;
        rawZChart.data.datasets[0].data = rawZValues;
        rawZChart.update();

        deltaZChart.data.labels = timestamps;
        deltaZChart.data.datasets[0].data = deltaZValues;
        deltaZChart.update();

        // Update frequency chart with raw data (no sorting)
        if (data.frequencyData && data.frequencyData.frequencies && data.frequencyData.amplitudes) {
            // Use raw frequency data directly
            frequencyChart.data.labels = data.frequencyData.frequencies;
            frequencyChart.data.datasets[0].data = data.frequencyData.amplitudes;
            frequencyChart.update();

            // Update time series charts if they exist
            if (window.frequencyTimeChart && window.amplitudeTimeChart) {
                window.frequencyTimeChart.data.labels = timestamps;
                window.frequencyTimeChart.data.datasets[0].data = data.data.map(p => p.frequency || 0);
                window.frequencyTimeChart.update();

                window.amplitudeTimeChart.data.labels = timestamps;
                window.amplitudeTimeChart.data.datasets[0].data = data.data.map(p => p.amplitude || 0);
                window.amplitudeTimeChart.update();
            }
        }

        showNotification("Historical session data loaded successfully", "success");
    } else {
        showNotification("No data available for this session", "error");
    }
}

function updateVibrationData(data) {
    if (viewingHistoricalSession) return;

    dataPointCount++;
    document.getElementById('dataPointCount').textContent = dataPointCount;

    const timestamp = new Date(data.timestamp || Date.now()).toLocaleTimeString();
    
    // Update current values immediately without waiting for animation
    document.getElementById('currentZValue').textContent = data.deltaZ.toFixed(3);
    document.getElementById('amplitudeValue').textContent = data.amplitude?.toFixed(3) || '0.000';

    // Use the optimized chart update function
    updateChartData(rawZChart, timestamp, data.rawAcceleration || data.rawZ || 0);
    updateChartData(deltaZChart, timestamp, data.deltaZ || 0);
    
    if (!isRecording && data.frequency && data.amplitude) {
        const freqIndex = frequencyChart.data.labels.indexOf(data.frequency);
        if (freqIndex === -1) {
            frequencyChart.data.labels.push(data.frequency);
            frequencyChart.data.datasets[0].data.push(data.amplitude);
            frequencyChart.update('none');
        } else if (data.amplitude > frequencyChart.data.datasets[0].data[freqIndex]) {
            frequencyChart.data.datasets[0].data[freqIndex] = data.amplitude;
            frequencyChart.update('none');
        }
    }
}

function updateButtonStates(isRecording) {
    const startButton = document.getElementById('startTest');
    const stopButton = document.getElementById('stopTest');
    const exportButton = document.getElementById('exportData');
    const startSessionBtn = document.getElementById('startSessionBtn');
    
    startButton.disabled = isRecording;
    startButton.classList.toggle('opacity-50', isRecording);
    
    stopButton.disabled = !isRecording;
    stopButton.classList.toggle('opacity-50', !isRecording);
    
    exportButton.disabled = isRecording;
    exportButton.classList.toggle('opacity-50', isRecording);
    
    startSessionBtn.disabled = isRecording;
    startSessionBtn.classList.toggle('opacity-50', isRecording);
}

function updateChartData(chart, label, value) {
    if (chart.data.labels.length > 50) { // Reduce buffer size for better performance
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(value);
    chart.update('none'); // Use 'none' mode for better performance
}

// Test session control buttons
function onTestStarted(data) {
    debug("Test started:", data);
    currentSession = data.sessionId;
    isRecording = true;
    dataPointCount = 0;
    document.getElementById('dataPointCount').textContent = '0';
    
    // Update UI buttons
    updateButtonStates(true);
    
    // Clear only the real-time charts
    rawZChart.data.labels = [];
    rawZChart.data.datasets[0].data = [];
    deltaZChart.data.labels = [];
    deltaZChart.data.datasets[0].data = [];
    rawZChart.update();
    deltaZChart.update();
    
    // Reset only essential displays during recording
    document.getElementById('currentZValue').textContent = '0.000';
    document.getElementById('amplitudeValue').textContent = '0.000';
    
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
    
    // Show processing indicator while loading full data
    showNotification("Processing data and calculating frequency analysis...", "info");
    
    // Request complete session data after stopping
    if (socket && socket.readyState === WebSocket.OPEN) {
        setTimeout(() => {
            socket.send(JSON.stringify({
                type: 'get_session_data',
                sessionId: currentSession
            }));
        }, 1000); // Give server time to process data
    }
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
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'stop_test',
                sessionId: sessionId || currentSession  // Add fallback to current session
            }));
            showNotification("Stopping session...", "info");
        } else {
            showNotification("Connection lost. Please refresh the page.", "error");
        }
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
        updateButtonStates(true);
    } else {
        showNotification("Connection to server lost. Reconnecting...", "error");
        connectWebSocket();
    }
});

document.getElementById('stopTest').addEventListener('click', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'stop_test' }));
        updateButtonStates(false);
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