import express from 'express';
import mongoose from 'mongoose';
import DeepseekService from '../utils/deepseekService.js';
import TestSession from '../models/TestSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Report from '../models/Report.js';

const router = express.Router();
const deepseek = new DeepseekService(process.env.DEEPSEEK_API_KEY);

// Get chat history for a session
router.get('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Validate session ID
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    // Get chat messages for the session
    const messages = await ChatMessage.find({ sessionId })
      .sort({ timestamp: 1 });
    
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Get chat history for a specific session
router.get('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    // Check if session exists
    const session = await TestSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get chat messages for this session
    const messages = await ChatMessage.find({ sessionId })
                                     .sort({ timestamp: 1 })
                                     .lean();
    
    res.json({ 
      sessionId,
      sessionName: session.name,
      messages
    });
    
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Send a message to the AI assistant
router.post('/chat/message', async (req, res) => {
  try {
    // Extract sessionId and message from request body
    const { sessionId, message } = req.body;
    
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Retrieve the session data to provide context to the AI
    const session = await TestSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get recent chat history for context (last 10 messages)
    const chatHistory = await ChatMessage.find({ sessionId })
                                        .sort({ timestamp: -1 })
                                        .limit(10)
                                        .lean();
    
    // Store user message
    const userMessage = new ChatMessage({
      sessionId,
      role: 'user',
      content: message
    });
    await userMessage.save();
    
    // Create system prompt with session data for context and markdown formatting guidance
    const systemPrompt = `You are a helpful assistant for vibration analysis data. 
    You are analyzing data from session "${session.name}" with the following metrics:
    - Natural Frequency: ${session.naturalFrequency?.toFixed(2) || 'Not calculated'} Hz
    - Peak Amplitude: ${session.peakAmplitude?.toFixed(3) || 'Not measured'}
    - Data Points: ${session.zAxisData?.length || 0}
    - Session Status: ${session.isActive ? 'Active' : 'Completed'}
    - Start Time: ${new Date(session.startTime).toLocaleString()}
    ${session.endTime ? `- End Time: ${new Date(session.endTime).toLocaleString()}` : ''}
    
    When answering questions, focus on Z-axis vibration characteristics, possible causes of resonance, 
    and practical advice for interpreting the vibration signature.
    
    Format your responses with proper markdown:
    - Use **bold** for important values or key terms
    - Use headings with ### for sections
    - Use bullet lists or numbered lists for steps
    - Use \`code\` for technical values
    - Keep your responses clear, concise and professional`;
    
    // Format messages for the AI
    const messages = [
      // Add recent chat history (reversed to be in chronological order)
      ...chatHistory.reverse().map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      // Add the current user message
      { role: 'user', content: message }
    ];
    
    // Call DeepSeek API for completion
    const deepseekService = new DeepseekService(process.env.DEEPSEEK_API_KEY);
    const completion = await deepseekService.chatCompletion({
      messages,
      systemPrompt,
      temperature: 0.7
    });
    
    // Extract the assistant's reply
    const assistantReply = completion.choices?.[0]?.message?.content || 
                          "I'm sorry, I couldn't analyze the vibration data at this time.";
    
    // Store the assistant's response
    const assistantMessage = new ChatMessage({
      sessionId,
      role: 'assistant',
      content: assistantReply
    });
    await assistantMessage.save();
    
    res.json({ 
      message: assistantReply,
      messageId: assistantMessage._id
    });
    
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Generate a report for a session
router.post('/reports/generate', async (req, res) => {
  try {
    const { sessionId, authorName } = req.body;
    
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    // Set the report author name if provided
    if (authorName) {
      process.env.REPORT_AUTHOR_NAME = authorName;
    }
    
    // Get session data
    const session = await TestSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`Sending session data with ${session.zAxisData?.length} data points`);
    
    // Generate PDF report
    const pdfBuffer = await deepseek.generateReport(session);
    
    // Save report to database
    const report = new Report({
      sessionId,
      name: `Report for ${session.name}`,
      fileName: `vibration_report_${session._id}_${Date.now()}.pdf`,
      fileData: pdfBuffer,
      insights: 'AI-generated vibration analysis report',
      metadata: {
        naturalFrequency: session.naturalFrequency || 0,
        peakAmplitude: session.peakAmplitude || 0,
        qFactor: session.mechanicalProperties?.qFactor || 0,
        dataPoints: session.zAxisData?.length || 0,
        authorName: authorName || 'Vibration Analysis Team',
        duration: session.endTime ? 
          `${Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 60000)}:${Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000) % 60}` : 
          'N/A'
      }
    });
    
    await report.save();
    
    res.json({
      reportId: report._id,
      message: 'Report generated successfully'
    });
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get all reports
router.get('/reports', async (req, res) => {
  try {
    const reports = await Report.find({}, {
      fileData: 0 // Exclude binary data for listing
    }).sort({ createdAt: -1 });
    
    res.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get a specific report
router.get('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }
    
    const report = await Report.findById(reportId, {
      fileData: 0 // Exclude binary data
    });
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json({ report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Download a report
router.get('/reports/:reportId/download', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }
    
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    
    // Send the PDF file
    res.send(report.fileData);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

// Delete a report
router.delete('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }
    
    const report = await Report.findByIdAndDelete(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

export default router;
