import { NextResponse } from 'next/server';
import { getWhatsAppClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

interface ProfileData {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profilePictureUrl?: string;
}

let cachedProfile: ProfileData | null = null;

export async function GET() {
  if (cachedProfile) {
    return NextResponse.json(cachedProfile);
  }

  const profile: ProfileData = {
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhoneNumber: '',
    verifiedName: '',
  };

  // Use the SDK's internal request method (handles auth headers correctly)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = getWhatsAppClient() as any;

  // 1. Fetch business profile with fields param
  try {
    const bpRes = await client.request('GET', `${PHONE_NUMBER_ID}/whatsapp_business_profile`, {
      query: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' },
      responseType: 'json',
    });
    console.log('[profile] businessProfile:', JSON.stringify(bpRes));
    const biz = bpRes?.data?.[0];
    if (biz) {
      profile.about = biz.about;
      profile.address = biz.address;
      profile.description = biz.description;
      profile.email = biz.email;
      profile.websites = biz.websites;
      profile.vertical = biz.vertical;
      profile.profilePictureUrl = biz.profilePictureUrl;
    }
  } catch (e) {
    console.error('[profile] businessProfile error:', e);
  }

  // 2. Fetch phone number details (display number + verified name)
  try {
    const phoneRes = await client.request('GET', PHONE_NUMBER_ID, {
      query: { fields: 'display_phone_number,verified_name,quality_rating' },
      responseType: 'json',
    });
    console.log('[profile] phoneNumber:', JSON.stringify(phoneRes));
    if (phoneRes?.displayPhoneNumber) profile.displayPhoneNumber = phoneRes.displayPhoneNumber;
    if (phoneRes?.verifiedName) profile.verifiedName = phoneRes.verifiedName;
    // Also check snake_case (raw response may not be converted)
    if (phoneRes?.display_phone_number) profile.displayPhoneNumber = phoneRes.display_phone_number;
    if (phoneRes?.verified_name) profile.verifiedName = phoneRes.verified_name;
  } catch (e) {
    console.error('[profile] phoneNumber error:', e);
  }

  cachedProfile = profile;
  return NextResponse.json(profile);
}
