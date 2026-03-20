const express = require('express');
const { google } = require('googleapis');
const twilio = require('twilio');

const app = express();
app.use(express.json());

// Credentials from environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

// Google Calendar Auth
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Get current date route
app.get('/get-date', (req, res) => {
  const now = new Date();
  const formatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Toronto'
  });
  res.json({ result: 'success', date: formatted });
});

// Book appointment route
app.post('/book', async (req, res) => {
  const { Name, Phone, Address, DateTime } = req.body;

  try {
    // Check if slot is available
    const existingEvents = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: new Date(DateTime).toISOString(),
      timeMax: new Date(new Date(DateTime).getTime() + 60 * 60 * 1000).toISOString(),
      singleEvents: true,
    });

    if (existingEvents.data.items.length > 0) {
      return res.json({ result: 'That time is taken' });
    }

    // Create the calendar event
    await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: `Inspection: ${Name}`,
        location: Address,
        description: `Customer: ${Name} | Phone: ${Phone} | Address: ${Address}`,
        start: { 
          dateTime: DateTime, 
          timeZone: 'America/Toronto' 
        },
        end: { 
          dateTime: new Date(new Date(DateTime).getTime() + 60 * 60 * 1000).toISOString(), 
          timeZone: 'America/Toronto' 
        },
      },
    });

    // Format date and time for SMS
    const appointmentDate = new Date(DateTime);
    const formattedDate = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Toronto'
    });
    const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto'
    });

    // Send Twilio SMS
    const cleanPhone = String(Phone).replace(/\D/g, '');
    const formattedPhone = '+1' + cleanPhone;

    await twilioClient.messages.create({
      body: `Hi ${Name}, your Skyline Roofing inspection is confirmed at ${Address} on ${formattedDate} at ${formattedTime}. Questions? Call us anytime!`,
      from: TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    return res.json({ result: 'success', message: 'Appointment confirmed' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ result: 'error', message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
