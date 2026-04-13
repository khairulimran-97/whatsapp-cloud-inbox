import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

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

// Per-profile cache
const profileCache = new Map<string, ProfileData>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileIdParam = searchParams.get('profileId');
  const { client, profile: waProfile } = resolveProfile(profileIdParam);

  const cached = profileCache.get(waProfile.id);
  if (cached) {
    return NextResponse.json(cached);
  }

  const profile: ProfileData = {
    phoneNumberId: waProfile.phoneNumberId,
    displayPhoneNumber: waProfile.phoneDisplay || '',
    verifiedName: '',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClient = client as any;

  try {
    const bpRes = await rawClient.request('GET', `${waProfile.phoneNumberId}/whatsapp_business_profile`, {
      query: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' },
      responseType: 'json',
    });
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

  try {
    const phoneRes = await rawClient.request('GET', waProfile.phoneNumberId, {
      query: { fields: 'display_phone_number,verified_name,quality_rating' },
      responseType: 'json',
    });
    if (phoneRes?.displayPhoneNumber) profile.displayPhoneNumber = phoneRes.displayPhoneNumber;
    if (phoneRes?.verifiedName) profile.verifiedName = phoneRes.verifiedName;
    if (phoneRes?.display_phone_number) profile.displayPhoneNumber = phoneRes.display_phone_number;
    if (phoneRes?.verified_name) profile.verifiedName = phoneRes.verified_name;
  } catch (e) {
    console.error('[profile] phoneNumber error:', e);
  }

  profileCache.set(waProfile.id, profile);
  return NextResponse.json(profile);
}
