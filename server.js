require('dotenv').config(); 
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
  origin: ['http://127.0.0.1:8000', 'http://localhost:3000']
}));

const apiKey = process.env.OPENAI_API_KEY;

let conversation = [
  {
    role: 'system',
    content: `You are a medical diagnosis chatbot. Your role is to assist users by asking
     relevant questions about their symptoms and providing potential diagnoses based on
     the information given. Always remind users that your suggestions are not a substitute
     for professional medical advice and encourage them to consult with a healthcare
     provider for accurate diagnosis and treatment. Be empathetic, clear, and thorough
     in your responses. Important: Ask only one question at a time about the user's symptoms or condition.
     Wait for the user's response before asking the next question.`
  }
];

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    conversation.push({ role: 'user', content: message });

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: conversation,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    conversation.push({ role: 'assistant', content: aiResponse });

    res.json({ reply: aiResponse });
  } catch (error) {
    console.error('Error in /chat:', error);
    res.status(500).json({ error: 'An error occurred', details: error.message });
  }
});

app.post('/end-conversation', async (req, res) => {
  const { user_Id } = req.body;
  try {
    console.log('Generating summary of the conversation...');
    const summaryResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Summarize the following conversation, highlighting key points and providing a specific diagnosis based on the user's symptoms. Do not end with a question. Provide the diagnosis clearly in all chats like diagnosis: diagnosis should be one or two words and then you provide separate 
            detail summary of the conversation. Also provide a full summary`
          },
          ...conversation
        ],
        max_tokens: 150, 
        temperature: 0.3 
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`, 
          'Content-Type': 'application/json',
        },
      }
    );

    function extractDiagnosis(summaryContent) {
      
      const parts = summaryContent.split('\n'); 
      const diagnosis = parts.find(part => part.toLowerCase().startsWith('diagnosis:'));
      return diagnosis ? diagnosis.replace('Diagnosis:', '').trim() : 'No diagnosis found';
    }

    const summaryContent = summaryResponse.data.choices[0].message.content; 
    console.log('Summary generated:', summaryContent);
    const diagnosisContent = extractDiagnosis(summaryContent);

    console.log('Attempting to send summary to Django server...');
    try {
      const djangoResponse = await axios.post('http://127.0.0.1:8000/users/store-summary/', {
        summary_content: summaryContent,
        user_id: user_Id,
        diagnosis_content: diagnosisContent
      });
      console.log('Response from Django server:', djangoResponse.data);
    } catch (djangoError) {
      console.error('Error sending request to Django server:', djangoError.message);
      if (djangoError.response) {
        console.error('Django server response:', djangoError.response.data);
      } else if (djangoError.request) {
        console.error('No response received from Django server');
      }
      throw djangoError;
    }

    
    conversation = [
      {
        role: 'system',
        content: `You are a medical diagnosis chatbot. Your role is to assist users by asking
         relevant questions about their symptoms and providing potential diagnoses based on
         the information given. Always remind users that your suggestions are not a substitute
         for professional medical advice and encourage them to consult with a healthcare
         provider for accurate diagnosis and treatment. Be empathetic, clear, and thorough
         in your responses. Important: Ask only one question at a time about the user's symptoms or condition.
         Wait for the user's response before asking the next question.`
      }
    ];

    res.json({ message: 'Conversation ended and summary stored successfully.' });
  } catch (error) {
    console.error('Detailed error in /end-conversation:', error);
    res.status(500).json({ error: 'An error occurred while ending the conversation', details: error.message });
  }
});


app.get('/test-django-connection', async (req, res) => {
  try {
    const response = await axios.get('http://127.0.0.1:8000/');
    res.json({ message: 'Connection successful', data: response.data });
  } catch (error) {
    console.error('Error connecting to Django server:', error.message);
    res.status(500).json({ error: 'Failed to connect to Django server', details: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

