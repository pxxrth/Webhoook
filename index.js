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

  // Validate DateTime
  const parsedDate = new Date(DateTime);
  if (!DateTime || isNaN(parsedDate.getTime())) {
    return res.json({
      result: 'error',
      message: `Invalid date format received: "${DateTime}". You must convert the date to ISO 8601 format before calling this tool. Example: "Saturday March 22 2026 at 10am" must be sent as "2026-03-22T10:00:00".`
    });
  }

  const timeMin = parsedDate.toISOString();
  const timeMax = new Date(parsedDate.getTime() + 60 * 60 * 1000).toISOString();

  try {
    // Check if slot is available
    const existingEvents = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
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
          dateTime: timeMin,
          timeZone: 'America/Toronto'
        },
        end: {
          dateTime: timeMax,
          timeZone: 'America/Toronto'
        },
      },
    });

    // Format date and time for SMS
    const formattedDate = parsedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Toronto'
    });
    const formattedTime = parsedDate.toLocaleTimeString('en-US', {
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
