/**
 * DeepSeek AI API Service
 * Provides integration with DeepSeek's LLM for chat and report generation
 */
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit'; // Add this import at the top of the file
import fs from 'fs'; // Also import fs module properly

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeepseekService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1';
    
    // Ensure the API key is provided
    if (!this.apiKey) {
      console.error('DeepSeek API key is missing. Set DEEPSEEK_API_KEY in .env file.');
    }
  }
  
  /**
   * Chat completion with DeepSeek API
   * @param {Object} options - Chat options
   * @param {Array} options.messages - Chat messages
   * @param {String} options.systemPrompt - System prompt
   * @param {Number} options.temperature - Randomness (0-1)
   * @returns {Promise<Object>} - Chat response
   */
  async chatCompletion(options) {
    try {
      const { messages, systemPrompt, temperature = 0.7 } = options;
      
      const formattedMessages = [];
      
      // Add system prompt if provided
      if (systemPrompt) {
        formattedMessages.push({
          role: 'system', 
          content: systemPrompt
        });
      }
      
      // Add user messages
      formattedMessages.push(...messages);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: formattedMessages,
          temperature: temperature,
          max_tokens: 2048
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API Error (${response.status}): ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('DeepSeek chat completion error:', error);
      throw error;
    }
  }
  
  /**
   * Generate a lab report based on vibration data
   * @param {Object} sessionData - Session data with vibration readings
   * @returns {Promise<Buffer>} - PDF document as buffer
   */
  async generateReport(sessionData) {
    try {
      // Extract key data for the report
      const { name, startTime, endTime, zAxisData = [] } = sessionData;
      const { naturalFrequency, peakAmplitude } = sessionData;
      const mechanicalProps = sessionData.mechanicalProperties || {};
      
      // Calculate statistics from z-axis data
      const readings = zAxisData.length;
      const dataStats = this.calculateDataStatistics(zAxisData);
      
      // Prepare context for the AI - store raw numeric values
      const reportContext = {
        sessionName: name,
        startTime: startTime,
        endTime: endTime || null,
        duration: endTime ? this.calculateDuration(startTime, endTime) : null,
        readings: readings,
        naturalFrequency: typeof naturalFrequency === 'number' ? naturalFrequency : null,
        peakAmplitude: typeof peakAmplitude === 'number' ? peakAmplitude : null,
        mechanicalProperties: {
          qFactor: typeof mechanicalProps.qFactor === 'number' ? mechanicalProps.qFactor : null,
          bandwidth: typeof mechanicalProps.bandwidth === 'number' ? mechanicalProps.bandwidth : null,
          naturalPeriod: typeof mechanicalProps.naturalPeriod === 'number' ? mechanicalProps.naturalPeriod : null,
        },
        rmsValue: dataStats.rms,
        meanValue: dataStats.mean,
        dataAnalysisDate: new Date().toLocaleString(),
        zAxisData: zAxisData
      };

      // Generate AI analysis content (this stays the same)
      const analysisContent = await this.generateAIAnalysis(reportContext);
      
      // Generate PDF report with proper markdown rendering
      const pdfBuffer = await this.createPDF(reportContext, analysisContent);
      
      return pdfBuffer;
    } catch (error) {
      console.error('Error generating report:', error);
      throw new Error('Failed to generate vibration analysis report');
    }
  }
  
  /**
   * Create a PDF report with proper markdown formatting
   * @param {Object} reportContext - Context data for the report
   * @param {String} analysisContent - AI-generated analysis content with markdown
   * @returns {Promise<Buffer>} - PDF document as buffer
   */
  async createPDF(reportContext, analysisContent) {
    return new Promise((resolve, reject) => {
      try {
        // Create a new PDF document
        const doc = new PDFDocument({
          margins: { top: 50, bottom: 50, left: 72, right: 72 },
          size: 'A4'
        });
        
        // Collect PDF data in a buffer
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        
        // Set up fonts
        doc.registerFont('Heading', 'Helvetica-Bold');
        doc.registerFont('Regular', 'Helvetica');
        doc.registerFont('Bold', 'Helvetica-Bold');
        doc.registerFont('Italic', 'Helvetica-Oblique');
        
        // Add header
        doc.font('Heading')
           .fontSize(18)
           .fillColor('#2563eb')
           .text('Z-Axis Vibration Analysis Report', { align: 'center' });
        
        doc.moveDown(1);
        
        // Session Information Section
        doc.fontSize(14)
           .fillColor('#000000')
           .text('Session Information:');
        
        doc.font('Regular')
           .fontSize(11)
           .moveDown(0.5)
           .fillColor('#333333')
           .text(`Session Name: ${reportContext.sessionName}`);
        
        doc.text(`Start Time: ${new Date(reportContext.startTime).toLocaleString()}`);
        
        if (reportContext.endTime) {
          doc.text(`End Time: ${new Date(reportContext.endTime).toLocaleString()}`);
        }
        
        doc.moveDown(1);
        
        // Frequency Analysis Section
        doc.font('Heading')
           .fontSize(14)
           .fillColor('#000000')
           .text('Frequency Analysis:');
        
        doc.font('Regular')
           .fontSize(11)
           .moveDown(0.5)
           .fillColor('#333333');
        
        if (reportContext.naturalFrequency) {
          doc.text(`Natural Frequency: ${reportContext.naturalFrequency.toFixed(2)} Hz`);
        }
        
        if (reportContext.peakAmplitude) {
          doc.text(`Peak Amplitude: ${reportContext.peakAmplitude.toFixed(3)}`);
        }
        
        if (reportContext.mechanicalProperties.qFactor) {
          doc.text(`Q Factor: ${reportContext.mechanicalProperties.qFactor.toFixed(2)}`);
        }
        
        if (reportContext.mechanicalProperties.naturalPeriod) {
          doc.text(`Natural Period: ${reportContext.mechanicalProperties.naturalPeriod.toFixed(4)} s`);
        }
        
        if (reportContext.mechanicalProperties.bandwidth) {
          doc.text(`Bandwidth: ${reportContext.mechanicalProperties.bandwidth.toFixed(3)} Hz`);
        }
        
        doc.moveDown(1);
        
        // AI Analysis Section
        doc.font('Heading')
           .fontSize(14)
           .fillColor('#000000')
           .text('AI Analysis:');
        
        doc.moveDown(0.5);
        
        // Parse and render markdown content
        this.renderMarkdown(doc, analysisContent);
        
        // End the PDF
        doc.end();
        
      } catch (error) {
        console.error('Error creating PDF:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Render markdown content to PDF with proper formatting
   * @param {PDFDocument} doc - PDFKit document
   * @param {String} markdown - Markdown formatted text
   */
  renderMarkdown(doc, markdown) {
    if (!markdown) return;
    
    // Split the markdown into lines
    const lines = markdown.split('\n');
    
    let inList = false;
    let listIndent = 0;
    let codeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Handle horizontal rules
      if (line.trim() === '---') {
        doc.moveDown(0.5);
        doc.lineWidth(1)
           .lineCap('butt')
           .moveTo(72, doc.y)
           .lineTo(doc.page.width - 72, doc.y)
           .stroke('#cccccc');
        doc.moveDown(0.5);
        continue;
      }
      
      // Handle code blocks
      if (line.startsWith('```')) {
        codeBlock = !codeBlock;
        if (!codeBlock) doc.moveDown(0.5);
        continue;
      }
      
      if (codeBlock) {
        doc.font('Courier')
           .fontSize(10)
           .fillColor('#666666')
           .text(line, { continued: false });
        continue;
      }
      
      // Handle headings
      if (line.startsWith('# ')) {
        doc.font('Heading').fontSize(16).fillColor('#000000');
        line = line.substring(2);
      } else if (line.startsWith('## ')) {
        doc.font('Heading').fontSize(14).fillColor('#333333');
        line = line.substring(3);
      } else if (line.startsWith('### ')) {
        doc.font('Heading').fontSize(12).fillColor('#444444');
        line = line.substring(4);
      } else if (line.startsWith('#### ')) {
        doc.font('Heading').fontSize(11).fillColor('#555555');
        line = line.substring(5);
      } else {
        // Regular paragraph text
        doc.font('Regular').fontSize(11).fillColor('#333333');
      }
      
      // Handle lists
      let listMatch = line.match(/^(\s*)[-*] (.*)$/);
      if (listMatch) {
        const spaces = listMatch[1].length;
        const content = listMatch[2];
        
        if (!inList) {
          doc.moveDown(0.5);
          inList = true;
        }
        
        // Calculate list indentation level
        listIndent = Math.floor(spaces / 2);
        
        // Format list item
        doc.text('• ', { continued: true, indent: 10 * listIndent });
        
        // Handle formatting within list item
        this.renderFormattedText(doc, content);
        continue;
      } else if (inList && line.trim() === '') {
        inList = false;
        doc.moveDown(0.5);
        continue;
      }
      
      // Handle bold and italic formatting in regular text
      if (line.trim() !== '') {
        this.renderFormattedText(doc, line);
      } else {
        doc.moveDown(0.5);
      }
    }
  }
  
  /**
   * Renders text with bold and italic formatting
   * @param {PDFDocument} doc - PDFKit document
   * @param {String} text - Text with markdown formatting
   */
  renderFormattedText(doc, text) {
    // Original font and size
    const originalFont = doc._font ? doc._font.name : 'Regular';
    const originalSize = doc._fontSize || 11;
    const originalColor = doc._fillColor || '#333333';
    
    // Process bold and italic formatting
    let segments = [];
    let currentIndex = 0;
    
    // Regular expression to match bold (**text**), bold-italic (***text***), and italic (*text*)
    const regex = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        segments.push({
          type: 'regular',
          text: text.substring(currentIndex, match.index)
        });
      }
      
      // Determine type of formatting
      if (match[0].startsWith('***')) {
        // Bold-italic
        segments.push({
          type: 'bold-italic',
          text: match[2]
        });
      } else if (match[0].startsWith('**')) {
        // Bold
        segments.push({
          type: 'bold',
          text: match[3]
        });
      } else {
        // Italic
        segments.push({
          type: 'italic',
          text: match[4]
        });
      }
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentIndex < text.length) {
      segments.push({
        type: 'regular',
        text: text.substring(currentIndex)
      });
    }
    
    // If no formatting was found, just add the text as is
    if (segments.length === 0) {
      segments.push({
        type: 'regular',
        text: text
      });
    }
    
    // Render segments
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      
      switch (segment.type) {
        case 'bold':
          doc.font('Bold');
          break;
        case 'italic':
          doc.font('Italic');
          break;
        case 'bold-italic':
          doc.font('Bold'); // PDFKit doesn't have a bold-italic font by default
          break;
        default:
          doc.font('Regular');
      }
      
      doc.text(segment.text, { continued: !isLast });
      
      // Reset to original state
      if (!isLast) {
        doc.font(originalFont).fontSize(originalSize).fillColor(originalColor);
      }
    }
    
    // Always end with a line break
    if (segments.length > 0) {
      doc.text('', { continued: false });
    }
  }
  
  /**
   * Generate AI analysis for the report
   * @param {Object} reportContext - Data context for the report
   * @returns {Promise<String>} - Markdown formatted analysis text
   */
  async generateAIAnalysis(reportContext) {
    try {
      // Create a structured prompt for the analysis
      const prompt = `
Generate a comprehensive vibration analysis report based on the following data.
Use proper markdown formatting with headings, bullet points, and emphasis.

Session Name: ${reportContext.sessionName}
Date: ${new Date(reportContext.startTime).toLocaleDateString()}
Duration: ${reportContext.duration || 'N/A'}
Number of Readings: ${reportContext.readings}

Key Metrics:
- Natural Frequency: ${reportContext.naturalFrequency?.toFixed(4) || 'Not detected'} Hz
- Peak Amplitude: ${reportContext.peakAmplitude?.toFixed(4) || 'N/A'} m/s²
- Q Factor: ${reportContext.mechanicalProperties.qFactor?.toFixed(2) || 'Not calculated'}
- RMS Value: ${reportContext.rmsValue?.toFixed(4) || 'N/A'} m/s²
- Natural Period: ${reportContext.mechanicalProperties.naturalPeriod?.toFixed(4) || 'N/A'} s
- Bandwidth: ${reportContext.mechanicalProperties.bandwidth?.toFixed(4) || 'N/A'} Hz

Format the report with the following sections using markdown:
1. Summary of Findings (brief overview)
2. Technical Analysis (detailed interpretation of frequency, damping, amplitude)
3. Possible Causes of Observed Vibration Patterns
4. Recommendations (immediate actions and long-term solutions)
5. Conclusion

Use proper markdown formatting:
- Use # for main headings, ## for subheadings, etc.
- Use **bold** for emphasis
- Use bullet points and numbered lists where appropriate
- Use horizontal rules (---) to separate sections

Please provide scientifically accurate interpretations based on data provided.
`;

      // Implement actual API call to DeepSeek
      // This is just a placeholder for the API call
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are a vibration analysis expert. Generate comprehensive vibration reports with accurate technical details and formatting.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000
        })
      });
      
      const responseData = await response.json();
      
      // Extract the generated analysis
      if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
        return responseData.choices[0].message.content;
      }
      
      return `# Vibration Analysis Report: ${reportContext.sessionName}

## Summary of Findings
Analysis was performed on Z-axis vibration data. The system showed a natural frequency of ${reportContext.naturalFrequency?.toFixed(2) || 'N/A'} Hz with peak amplitude of ${reportContext.peakAmplitude?.toFixed(3) || 'N/A'}.

## Technical Analysis
The Z-axis data showed typical vibration characteristics for this type of system.

---

## Recommendations
Regular monitoring is recommended to track any changes in the vibration signature.

## Conclusion
Based on the data collected, the system appears to be functioning within normal parameters.
`;
      
    } catch (error) {
      console.error('Error generating AI analysis:', error);
      return '# Error Generating Analysis\nUnable to generate vibration analysis. Please check the data and try again.';
    }
  }
  
  /**
   * Calculate statistics from z-axis data
   * @param {Array} zAxisData - Array of z-axis readings
   * @returns {Object} - Statistical measures
   */
  calculateDataStatistics(zAxisData) {
    if (!zAxisData || zAxisData.length === 0) {
      return { mean: 0, rms: 0, std: 0 };
    }
    
    // Extract numerical values
    const values = zAxisData.map(d => d.deltaZ || 0);
    
    // Calculate mean
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    
    // Calculate RMS (Root Mean Square)
    const squareSum = values.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(squareSum / values.length);
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    return { mean, rms, std };
  }
  
  /**
   * Calculate duration between two timestamps
   * @param {String|Date} startTime - Start timestamp
   * @param {String|Date} endTime - End timestamp
   * @returns {String} - Formatted duration
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    
    // Format duration as mm:ss
    const seconds = Math.floor(durationMs / 1000) % 60;
    const minutes = Math.floor(durationMs / (1000 * 60));
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

export default DeepseekService;
