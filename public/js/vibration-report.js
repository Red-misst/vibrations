/**
 * Vibration Analysis Report Generator
 * Creates PDF reports from vibration analysis data
 */

document.addEventListener('DOMContentLoaded', () => {
    // Report elements
    const reportSessionSelect = document.getElementById('reportSessionSelect');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const reportStatus = document.getElementById('reportStatus');
    const reportsContainer = document.getElementById('reportsContainer');
    
    let sessions = [];

    // Initialize the report generator
    function initReportGenerator() {
        // Disable the button until a session is selected
        generateReportBtn.disabled = true;
        
        // Add event listener to session select dropdown
        reportSessionSelect.addEventListener('change', () => {
            generateReportBtn.disabled = !reportSessionSelect.value;
        });
        
        // Add event listener to generate button
        generateReportBtn.addEventListener('click', generateReport);
        
        // Initial load of sessions and reports
        loadSessions();
        loadReports();
    }
    
    // Load available sessions for report generation
    async function loadSessions() {
        try {
            const response = await fetch('/api/sessions');
            if (!response.ok) {
                throw new Error('Failed to load sessions');
            }
            
            sessions = await response.json();
            updateSessionsDropdown(sessions);
        } catch (error) {
            console.error('Error loading sessions:', error);
            reportStatus.innerHTML = `<span class="text-red-400">Error loading sessions: ${error.message}</span>`;
        }
    }
    
    // Update the sessions dropdown with available sessions
    function updateSessionsDropdown(sessions) {
        // Clear existing options except the first one
        while (reportSessionSelect.options.length > 1) {
            reportSessionSelect.remove(1);
        }
        
        if (!sessions || sessions.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.text = 'No sessions available';
            option.disabled = true;
            reportSessionSelect.add(option);
            return;
        }
        
        // Add each session as an option
        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session._id;
            
            // Create a formatted date string for the session
            let startTime;
            try {
                startTime = new Date(session.startTime).toLocaleString();
            } catch (e) {
                startTime = 'Unknown date';
            }
            
            option.text = `${session.name} (${startTime})`;
            reportSessionSelect.add(option);
        });
    }
    
    // Load existing reports
    async function loadReports() {
        try {
            const response = await fetch('/api/reports');
            if (!response.ok) {
                throw new Error('Failed to load reports');
            }
            
            const data = await response.json();
            updateReportsList(data.reports);
        } catch (error) {
            console.error('Error loading reports:', error);
            reportStatus.innerHTML = `<span class="text-red-400">Error loading reports: ${error.message}</span>`;
        }
    }
    
    // Update the list of available reports
    function updateReportsList(reports) {
        reportsContainer.innerHTML = '';
        
        if (!reports || reports.length === 0) {
            reportsContainer.innerHTML = '<div class="text-gray-400 text-sm p-2">No reports available</div>';
            return;
        }
        
        reports.forEach(report => {
            const reportElement = document.createElement('div');
            reportElement.className = 'report-card flex justify-between items-center p-3 hover:bg-gray-600';
            
            const createdDate = new Date(report.createdAt).toLocaleString();
            
            reportElement.innerHTML = `
                <div>
                    <div class="font-medium text-gray-200">${report.name}</div>
                    <div class="text-xs text-gray-400">Created: ${createdDate}</div>
                </div>
                <div class="flex space-x-2">
                    <a href="/api/reports/${report._id}/download" target="_blank" 
                       class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs flex items-center">
                        <i class="fas fa-download mr-1"></i> Download
                    </a>
                    <button class="delete-report bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs flex items-center"
                            data-report-id="${report._id}">
                        <i class="fas fa-trash mr-1"></i> Delete
                    </button>
                </div>
            `;
            
            // Add event listener to delete button
            const deleteButton = reportElement.querySelector('.delete-report');
            deleteButton.addEventListener('click', () => deleteReport(report._id));
            
            reportsContainer.appendChild(reportElement);
        });
    }
    
    // Generate a new report
    async function generateReport() {
        const sessionId = reportSessionSelect.value;
        const authorName = document.getElementById('reportAuthorName').value.trim() || 'Vibration Analysis Team';
        
        if (!sessionId) {
            reportStatus.innerHTML = '<span class="text-yellow-400">Please select a session</span>';
            return;
        }
        
        // Update status and disable button
        reportStatus.innerHTML = '<span class="text-blue-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>Generating report...</span>';
        generateReportBtn.disabled = true;
        
        try {
            fetch('/api/reports/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    sessionId,
                    authorName 
                })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to generate report');
                }
                return response.json();
            })
            .then(data => {
                reportStatus.innerHTML = '<span class="text-green-400"><i class="fas fa-check mr-2"></i>Report generated successfully!</span>';
                
                // Reload the reports list
                setTimeout(() => {
                    loadReports();
                    reportStatus.innerHTML = '';
                }, 3000);
            })
            .catch(error => {
                console.error('Error generating report:', error);
                reportStatus.innerHTML = `<span class="text-red-400">Error: ${error.message}</span>`;
            })
            .finally(() => {
                generateReportBtn.disabled = false;
            });
        } catch (error) {
            console.error('Error generating report:', error);
            reportStatus.innerHTML = `<span class="text-red-400">Error: ${error.message}</span>`;
            generateReportBtn.disabled = false;
        }
    }
    
    // Delete a report
    async function deleteReport(reportId) {
        if (!confirm('Are you sure you want to delete this report?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/reports/${reportId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete report');
            }
            
            // Show success message briefly
            reportStatus.innerHTML = '<span class="text-green-400">Report deleted successfully</span>';
            setTimeout(() => {
                reportStatus.innerHTML = '';
            }, 3000);
            
            // Reload reports list
            loadReports();
            
        } catch (error) {
            console.error('Error deleting report:', error);
            reportStatus.innerHTML = `<span class="text-red-400">Error deleting report: ${error.message}</span>`;
        }
    }
    
    // Initialize the component
    initReportGenerator();
    
    // Listen for session changes from the main app and refresh our sessions list
    document.addEventListener('sessionChange', () => {
        setTimeout(loadSessions, 1000); // Slight delay to allow server to update
    });
    
    // Add event listener for when the WebSocket in the main app gets session list updates
    document.addEventListener('sessionsListUpdated', (e) => {
        if (e.detail && e.detail.sessions) {
            updateSessionsDropdown(e.detail.sessions);
        } else {
            loadSessions(); // Fallback to API call if no data provided
        }
    });
    
    // Make the function global so it can be called from the main app
    window.updateReportSessions = function(sessions) {
        updateSessionsDropdown(sessions);
    };
});
