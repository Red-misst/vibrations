/**
 * Vibration Monitor - Main JavaScript
 * Handles real-time vibration data monitoring, visualization, and session management
 */

class VibrationMonitor {
    constructor() {
        this.ws = null;
        this.currentSession = null;
        this.sessionStartTime = null;
        this.chartData = {
            labels: [],
            deltaZ: []
        };
        this.maxDataPoints = 50;
        this.statistics = {
            totalReadings: 0,
            totalVibration: 0,
            maxVibration: 0
        };
        this.frequencyChart = null;

        this.initChart();
        this.initFrequencyChart();
        this.initEventListeners();
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}?client=true`);

        this.ws.onopen = () => {
            this.updateConnectionStatus(true);
            this.loadSessions();
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus(false);
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'test_started':
                this.onTestStarted(data);
                break;
            case 'test_stopped':
                this.onTestStopped(data);
                break;
            case 'vibration_data':
                this.onVibrationData(data);
                break;
            case 'sessions_list':
                this.updateSessionsTable(data.sessions);
                break;
            case 'session_data':
                this.loadSessionData(data);
                break;
        }
    }    initChart() {
        const ctx = document.getElementById('vibration-chart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Z-Axis (Up/Down)',
                        data: [],
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#F3F4F6'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Z-Axis Vibration Data (Up/Down Movement)',
                        color: '#F3F4F6'
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#9CA3AF'
                        },
                        grid: {
                            color: '#374151'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#9CA3AF'
                        },
                        grid: {
                            color: '#374151'
                        }
                    }
                }
            }
        });
    }
    
    initFrequencyChart() {
        // Create a new canvas for frequency analysis chart
        const frequencySection = document.createElement('div');
        frequencySection.className = 'bg-gray-800 rounded-lg p-6 mb-8';
        frequencySection.innerHTML = `
            <h3 class="text-xl font-semibold mb-4">Natural Frequency Analysis</h3>
            <div class="mb-4" id="frequency-data">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-gray-700 p-4 rounded">
                        <div class="text-sm text-gray-400">Natural Frequency</div>
                        <div id="natural-frequency" class="text-xl font-mono">0 Hz</div>
                    </div>
                    <div class="bg-gray-700 p-4 rounded">
                        <div class="text-sm text-gray-400">Peak Amplitude</div>
                        <div id="peak-amplitude" class="text-xl font-mono">0.000</div>
                    </div>
                    <div class="bg-gray-700 p-4 rounded">
                        <div class="text-sm text-gray-400">Q Factor</div>
                        <div id="q-factor" class="text-xl font-mono">0.000</div>
                    </div>
                    <div class="bg-gray-700 p-4 rounded">
                        <div class="text-sm text-gray-400">Bandwidth</div>
                        <div id="bandwidth" class="text-xl font-mono">0.000 Hz</div>
                    </div>
                </div>
            </div>
            <div class="h-64">
                <canvas id="frequency-chart"></canvas>
            </div>
        `;
        
        // Insert after vibration chart
        const vibrationChartElement = document.getElementById('vibration-chart').parentNode.parentNode;
        vibrationChartElement.parentNode.insertBefore(frequencySection, vibrationChartElement.nextSibling);
        
        // Initialize the frequency chart
        const ctx = document.getElementById('frequency-chart').getContext('2d');
        this.frequencyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], // Frequencies
                datasets: [
                    {
                        label: 'Frequency Response',
                        data: [], // Amplitudes
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#F3F4F6'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Natural Frequency Spectrum',
                        color: '#F3F4F6'
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#9CA3AF'
                        },
                        grid: {
                            color: '#374151'
                        },
                        title: {
                            display: true,
                            text: 'Frequency (Hz)',
                            color: '#9CA3AF'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#9CA3AF'
                        },
                        grid: {
                            color: '#374151'
                        },
                        title: {
                            display: true,
                            text: 'Amplitude',
                            color: '#9CA3AF'
                        }
                    }
                }
            }
        });
    }

    initEventListeners() {
        document.getElementById('start-test').addEventListener('click', () => {
            const sessionName = document.getElementById('session-name').value.trim();
            if (!sessionName) {
                alert('Please enter a session name');
                return;
            }
            this.startTest(sessionName);
        });

        document.getElementById('stop-test').addEventListener('click', () => {
            this.stopTest();
        });
        
        document.getElementById('close-session-view').addEventListener('click', () => {
            document.getElementById('view-session-panel').classList.add('hidden');
            // Clear chart and reset view (optional: refresh live data)
            this.chartData = { labels: [], deltaZ: [] };
            this.updateChart();
        });
    }

    startTest(sessionName) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'start_test',
                sessionName: sessionName
            }));
        }
    }

    stopTest() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'stop_test'
            }));
        }
    }

    loadSessions() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'get_sessions'
            }));
        }
    }

    onTestStarted(data) {
        this.currentSession = data.sessionId;
        this.sessionStartTime = new Date();
        this.statistics = { totalReadings: 0, totalVibration: 0, maxVibration: 0 };
        
        document.getElementById('start-test').disabled = true;
        document.getElementById('stop-test').disabled = false;
        document.getElementById('session-name').value = '';
        
        const sessionInfo = document.getElementById('current-session');
        sessionInfo.classList.remove('hidden');
        document.getElementById('session-info').textContent = `${data.sessionName} (Started: ${this.sessionStartTime.toLocaleTimeString()})`;
        
        // Clear chart
        this.chartData = { labels: [], deltaZ: [] };
        this.updateChart();
        
        this.loadSessions();
    }

    onTestStopped(data) {
        this.currentSession = null;
        this.sessionStartTime = null;
        
        document.getElementById('start-test').disabled = false;
        document.getElementById('stop-test').disabled = true;
        document.getElementById('current-session').classList.add('hidden');
        
        this.loadSessions();
    }

    onVibrationData(data) {
        if (data.sessionId !== this.currentSession) return;

        const vibData = data.data;
        const timestamp = new Date().toLocaleTimeString();
        
        // Update live values - show Z-axis data regardless of magnitude
        document.getElementById('delta-z').textContent = vibData.deltaZ.toFixed(3);
        document.getElementById('last-update').textContent = timestamp;
        
        // Remove X and Y axis display elements if they exist
        const deltaXElement = document.getElementById('delta-x');
        const deltaYElement = document.getElementById('delta-y');
        if (deltaXElement) {
            deltaXElement.parentElement.style.display = 'none';
        }
        if (deltaYElement) {
            deltaYElement.parentElement.style.display = 'none';
        }
        
        // Update statistics for ANY vibration data
        this.statistics.totalReadings++;
        const totalVib = Math.abs(vibData.deltaZ);
        this.statistics.totalVibration += totalVib;
        this.statistics.maxVibration = Math.max(this.statistics.maxVibration, totalVib);
        
        document.getElementById('total-readings').textContent = this.statistics.totalReadings;
        document.getElementById('avg-vibration').textContent = (this.statistics.totalVibration / this.statistics.totalReadings).toFixed(3);
        document.getElementById('max-vibration').textContent = this.statistics.maxVibration.toFixed(3);
        
        if (this.sessionStartTime) {
            const duration = Math.floor((new Date() - this.sessionStartTime) / 1000);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            document.getElementById('session-duration').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Update chart - analyze ALL Z axis data
        this.chartData.labels.push(timestamp);
        this.chartData.deltaZ.push(vibData.deltaZ);
        
        // Keep only the last N data points
        if (this.chartData.labels.length > this.maxDataPoints) {
            this.chartData.labels.shift();
            this.chartData.deltaZ.shift();
        }
        
        this.updateChart();
    }

    updateChart() {
        this.chart.data.labels = this.chartData.labels;
        this.chart.data.datasets[0].data = this.chartData.deltaZ;
        this.chart.update('none');
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.innerHTML = '<span class="flex items-center"><div class="w-3 h-3 rounded-full bg-green-400 mr-2"></div>Connected</span>';
            statusEl.className = 'px-4 py-2 rounded-lg bg-green-600';
        } else {
            statusEl.innerHTML = '<span class="flex items-center"><div class="w-3 h-3 rounded-full bg-red-400 mr-2"></div>Disconnected</span>';
            statusEl.className = 'px-4 py-2 rounded-lg bg-red-600';
        }
    }

    updateSessionsTable(sessions) {
        const tbody = document.getElementById('sessions-table');
        tbody.innerHTML = '';
        
        sessions.forEach(session => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';
            
            const startTime = new Date(session.startTime);
            const endTime = session.endTime ? new Date(session.endTime) : null;
            const duration = endTime ? 
                Math.floor((endTime - startTime) / 1000) : 
                (session.isActive ? Math.floor((new Date() - startTime) / 1000) : 0);
            
            const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
            
            row.innerHTML = `
                <td class="p-2">${session.name}</td>
                <td class="p-2">${startTime.toLocaleString()}</td>
                <td class="p-2">${durationStr}</td>
                <td class="p-2">
                    <span class="px-2 py-1 rounded text-xs ${session.isActive ? 'bg-green-600' : 'bg-gray-600'}">
                        ${session.isActive ? 'Active' : 'Completed'}
                    </span>
                </td>
                <td class="p-2 flex gap-1">
                    <button 
                        onclick="monitor.viewSession('${session._id}')" 
                        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                    >
                        View Data
                    </button>
                    <button 
                        onclick="monitor.exportSession('${session._id}', '${session.name}')" 
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
                    >
                        Export CSV
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    viewSession(sessionId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // First, find the session details from the sessions table
            const rows = document.querySelectorAll('#sessions-table tr');
            let sessionDetails = null;
            
            rows.forEach(row => {
                const viewButton = row.querySelector('button');
                if (viewButton && viewButton.getAttribute('onclick').includes(sessionId)) {
                    const cells = row.querySelectorAll('td');
                    sessionDetails = {
                        name: cells[0].textContent,
                        startTime: cells[1].textContent,
                        duration: cells[2].textContent,
                        status: cells[3].textContent.trim()
                    };
                }
            });
            
            if (sessionDetails) {
                // Update the session info panel
                document.getElementById('view-session-name').textContent = sessionDetails.name;
                document.getElementById('view-session-start').textContent = sessionDetails.startTime;
                document.getElementById('view-session-panel').classList.remove('hidden');
            }
            
            // Request the session data
            this.ws.send(JSON.stringify({
                type: 'get_session_data',
                sessionId: sessionId
            }));
        }
    }

    loadSessionData(data) {
        // Clear current chart and load historical data
        this.chartData = { labels: [], deltaZ: [] };
        
        let maxVibration = 0;
        const readings = data.data.length;
        
        if (readings > 0) {
            // Find the end time (latest reading)
            const lastReading = data.data[readings - 1];
            const endTime = new Date(lastReading.receivedAt);
            document.getElementById('view-session-end').textContent = endTime.toLocaleString();
            document.getElementById('view-session-readings').textContent = readings;
            
            // Process all readings
            data.data.forEach(reading => {
                const timestamp = new Date(reading.receivedAt).toLocaleTimeString();
                this.chartData.labels.push(timestamp);
                this.chartData.deltaZ.push(reading.deltaZ);
                
                // Calculate max vibration
                const totalVib = Math.abs(reading.deltaZ);
                maxVibration = Math.max(maxVibration, totalVib);
            });
            
            document.getElementById('view-session-max').textContent = maxVibration.toFixed(3);
            
            // Update frequency data if available
            if (data.frequencyData) {
                this.updateFrequencyDisplay(data.frequencyData);
            }
        } else {
            document.getElementById('view-session-end').textContent = 'N/A';
            document.getElementById('view-session-readings').textContent = '0';
            document.getElementById('view-session-max').textContent = '0.000';
        }
        
        this.updateChart();
    }
    
    updateFrequencyDisplay(frequencyData) {
        // Update the frequency metrics display for ANY magnitude of data
        document.getElementById('natural-frequency').textContent = 
            frequencyData.naturalFrequency ? 
            `${frequencyData.naturalFrequency.toFixed(2)} Hz` : 
            '0.00 Hz';
            
        document.getElementById('peak-amplitude').textContent = 
            frequencyData.peakAmplitude ? 
            frequencyData.peakAmplitude.toFixed(3) : 
            '0.000';
            
        // Calculate and display Q factor if available
        const qFactor = frequencyData.qFactor || 0;
        document.getElementById('q-factor').textContent = 
            qFactor > 0 ? qFactor.toFixed(2) : '0.00';
            
        // Calculate and display bandwidth
        const bandwidth = frequencyData.bandwidth || 0;
        document.getElementById('bandwidth').textContent = 
            bandwidth > 0 ? `${bandwidth.toFixed(3)} Hz` : '0.000 Hz';
        
        // Generate frequency spectrum data for ANY vibration magnitude
        if (frequencyData.naturalFrequency || frequencyData.frequencies) {
            if (frequencyData.frequencies && frequencyData.magnitudes && 
                frequencyData.frequencies.length > 0 && frequencyData.magnitudes.length > 0) {
                
                console.log("Using server-provided frequency data");
                
                // Use the provided frequency and magnitude data
                this.frequencyChart.data.labels = frequencyData.frequencies;
                this.frequencyChart.data.datasets[0].data = frequencyData.magnitudes;
                this.frequencyChart.update();
                return;
            }
            
            // Generate synthetic frequency response curve for any detected frequency
            const fn = frequencyData.naturalFrequency || 1; // Default to 1 Hz if no frequency detected
            const damping = 0.05; // Default low damping
            
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
            
            this.frequencyChart.data.labels = frequencies;
            this.frequencyChart.data.datasets[0].data = amplitudes;
            this.frequencyChart.update();
        }
    }
    
    exportSession(sessionId, sessionName) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'get_session_data',
                sessionId: sessionId
            }));
            
            // Set up a one-time listener for the session data response
            const exportHandler = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'session_data' && data.sessionId === sessionId) {
                    // Remove this one-time listener
                    this.ws.removeEventListener('message', exportHandler);
                    
                    // Generate CSV
                    let csvContent = "data:text/csv;charset=utf-8,";
                    csvContent += "Timestamp,DeltaZ,Total\n";
                    
                    data.data.forEach(reading => {
                        const timestamp = new Date(reading.receivedAt).toISOString();
                        const totalVib = Math.abs(reading.deltaZ);
                        csvContent += `${timestamp},${reading.deltaZ},${totalVib.toFixed(4)}\n`;
                    });
                    
                    // Add frequency data if available
                    if (data.frequencyData) {
                        csvContent += "\nFrequency Analysis\n";
                        csvContent += `Natural Frequency (Hz),${data.frequencyData.naturalFrequency?.toFixed(4) || 'N/A'}\n`;
                        csvContent += `Peak Amplitude,${data.frequencyData.peakAmplitude?.toFixed(4) || 'N/A'}\n`;
                        csvContent += `Q Factor,${data.frequencyData.qFactor?.toFixed(4) || 'N/A'}\n`;
                        csvContent += `Bandwidth (Hz),${data.frequencyData.bandwidth?.toFixed(4) || 'N/A'}\n`;
                    }
                    
                    // Create download link
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `vibration_data_${sessionName}_${new Date().toISOString().slice(0,10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            };
            
            this.ws.addEventListener('message', exportHandler);
        }
    }
}

// Initialize the monitor after page loads
document.addEventListener('DOMContentLoaded', () => {
    window.monitor = new VibrationMonitor();
});
