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
        this.resonanceChart = null;

        this.initChart();
        this.initResonanceChart();
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
    
    initResonanceChart() {
        // Create a new canvas for resonance chart in the HTML
        const resonanceSection = document.createElement('div');
        resonanceSection.className = 'bg-gray-800 rounded-lg p-6 mb-8';
        resonanceSection.innerHTML = `
            <h3 class="text-xl font-semibold mb-4">Resonance Analysis</h3>
            <div class="mb-4" id="resonance-data">
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
                        <div class="text-sm text-gray-400">Damping Ratio</div>
                        <div id="damping-ratio" class="text-xl font-mono">0.000</div>
                    </div>
                    <div class="bg-gray-700 p-4 rounded">
                        <div class="text-sm text-gray-400">Q Factor</div>
                        <div id="q-factor" class="text-xl font-mono">0.000</div>
                    </div>
                </div>
            </div>
            <div class="h-64">
                <canvas id="resonance-chart"></canvas>
            </div>
        `;
        
        // Insert after vibration chart
        const vibrationChartElement = document.getElementById('vibration-chart').parentNode.parentNode;
        vibrationChartElement.parentNode.insertBefore(resonanceSection, vibrationChartElement.nextSibling);
        
        // Initialize the resonance chart
        const ctx = document.getElementById('resonance-chart').getContext('2d');
        this.resonanceChart = new Chart(ctx, {
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
                        text: 'Frequency Response Curve',
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
        
        // Update live values - only show Z-axis now
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
        
        // Update statistics
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
        
        // Update chart - only Z axis
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
            
            // Update resonance data if available
            if (data.resonanceData) {
                this.updateResonanceDisplay(data.resonanceData);
            }
        } else {
            document.getElementById('view-session-end').textContent = 'N/A';
            document.getElementById('view-session-readings').textContent = '0';
            document.getElementById('view-session-max').textContent = '0.000';
        }
        
        this.updateChart();
    }
    
    updateResonanceDisplay(resonanceData) {
        // Update the resonance metrics display
        document.getElementById('natural-frequency').textContent = 
            resonanceData.naturalFrequency ? 
            `${resonanceData.naturalFrequency.toFixed(2)} Hz` : 
            'N/A';
            
        document.getElementById('peak-amplitude').textContent = 
            resonanceData.peakAmplitude ? 
            resonanceData.peakAmplitude.toFixed(3) : 
            'N/A';
            
        document.getElementById('damping-ratio').textContent = 
            resonanceData.dampingRatios && resonanceData.dampingRatios.length > 0 ? 
            resonanceData.dampingRatios[0].toFixed(3) : 
            'N/A';
            
        // Calculate and display Q factor if damping ratio is available
        const dampingRatio = resonanceData.dampingRatios && resonanceData.dampingRatios.length > 0 ?
            resonanceData.dampingRatios[0] : null;
            
        if (dampingRatio && dampingRatio < 1) {
            const qFactor = 1 / (2 * dampingRatio);
            document.getElementById('q-factor').textContent = qFactor.toFixed(3);
        } else {
            document.getElementById('q-factor').textContent = 'N/A';
        }
        
        // Generate frequency response curve data for the resonance chart
        if (resonanceData.naturalFrequency) {
            const fn = resonanceData.naturalFrequency;
            const zeta = resonanceData.dampingRatios && resonanceData.dampingRatios.length > 0 ?
                resonanceData.dampingRatios[0] : 0.1; // Default if not available
                
            // Generate frequency range (0.1 to 2 times the natural frequency)
            const frequencies = [];
            const amplitudes = [];
            
            for (let ratio = 0.1; ratio <= 2.0; ratio += 0.05) {
                const f = fn * ratio;
                frequencies.push(f.toFixed(1));
                
                // Calculate amplitude ratio from frequency ratio using standard vibrational formula
                const r = f / fn;
                let amplitude;
                if (zeta < 1) {
                    amplitude = 1 / Math.sqrt(Math.pow(1 - r*r, 2) + Math.pow(2*zeta*r, 2));
                } else {
                    // Overdamped system
                    amplitude = 1 / Math.sqrt(Math.pow(1 - r*r, 2) + Math.pow(2*zeta*r, 2));
                }
                amplitudes.push(amplitude);
            }
            
            // Update the resonance chart
            this.resonanceChart.data.labels = frequencies;
            this.resonanceChart.data.datasets[0].data = amplitudes;
            this.resonanceChart.update('none');
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
                    
                    // Add resonance data if available
                    if (data.resonanceData) {
                        csvContent += "\nResonance Analysis\n";
                        csvContent += `Natural Frequency (Hz),${data.resonanceData.naturalFrequency?.toFixed(4) || 'N/A'}\n`;
                        csvContent += `Peak Amplitude,${data.resonanceData.peakAmplitude?.toFixed(4) || 'N/A'}\n`;
                        if (data.resonanceData.dampingRatios && data.resonanceData.dampingRatios.length > 0) {
                            csvContent += `Damping Ratio,${data.resonanceData.dampingRatios[0].toFixed(4)}\n`;
                            csvContent += `Q Factor,${(1/(2*data.resonanceData.dampingRatios[0])).toFixed(4)}\n`;
                        }
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
