// Bridge to the native iPhone/Android address book via Capacitor's plugin
// registry. We reach the plugin through registerPlugin (from @capacitor/core,
// already a dependency) rather than importing @capacitor-community/contacts,
// so the web build never needs that package. The native code is pulled in on
// the Mac via `npm install @capacitor-community/contacts` + `npx cap sync`.

import { Capacitor, registerPlugin } from "@capacitor/core";

export type PickedContact = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

type RawContact = {
  name?: { display?: string };
  phones?: { number?: string }[];
  emails?: { address?: string }[];
  postalAddresses?: {
    street?: string;
    city?: string;
    region?: string;
    postalCode?: string;
  }[];
};

interface ContactsPlugin {
  requestPermissions(): Promise<{ contacts: string }>;
  pickContact(options: {
    projection: Record<string, boolean>;
  }): Promise<{ contact: RawContact }>;
}

/** True only inside the native app, where the address book exists. */
export function contactsAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Open the native contact picker and return the chosen contact's details,
 *  or null if unavailable, denied, or cancelled. */
export async function pickContact(): Promise<PickedContact | null> {
  if (!contactsAvailable()) return null;
  try {
    const Contacts = registerPlugin<ContactsPlugin>("Contacts");
    await Contacts.requestPermissions();
    const { contact } = await Contacts.pickContact({
      projection: {
        name: true,
        phones: true,
        emails: true,
        postalAddresses: true,
      },
    });
    const a = contact.postalAddresses?.[0];
    const address = a
      ? [a.street, a.city, a.region, a.postalCode].filter(Boolean).join(", ")
      : "";
    return {
      name: contact.name?.display ?? "",
      phone: contact.phones?.[0]?.number ?? "",
      email: contact.emails?.[0]?.address ?? "",
      address,
    };
  } catch {
    return null;
  }
}
