// Bridge to the phone's address book. Two routes:
//   1. Native app (Capacitor): the @capacitor-community/contacts plugin,
//      reached via registerPlugin so the web build never needs the package.
//   2. Browser: the Web Contact Picker API (navigator.contacts). This exists
//      on Chrome for Android; iOS Safari has no web contacts API, so on an
//      iPhone the address book is only reachable from the native App Store app.

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
  getContacts?(options: {
    projection: Record<string, boolean>;
  }): Promise<{ contacts: RawContact[] }>;
}

/** Flatten one raw native contact into our simple shape. */
function fromNative(contact: RawContact): PickedContact {
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
}

// --- Web Contact Picker API (Android Chrome) ------------------------------
type WebContactsManager = {
  select(
    props: string[],
    opts: { multiple: boolean }
  ): Promise<
    Array<{
      name?: string[];
      tel?: string[];
      email?: string[];
      address?: Array<{
        addressLine?: string[];
        city?: string;
        region?: string;
        postalCode?: string;
      }>;
    }>
  >;
  getProperties?(): Promise<string[]>;
};

function webContacts(): WebContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as unknown as { contacts?: WebContactsManager }).contacts;
  return c && typeof c.select === "function" ? c : null;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True where a phone address book can be reached: the native app, or a
 *  browser that supports the Web Contact Picker (Android Chrome). */
export function contactsAvailable(): boolean {
  return isNative() || webContacts() !== null;
}

/** Open the phone's contact picker and return the chosen contact's details,
 *  or null if unavailable, denied, or cancelled. */
export async function pickContact(): Promise<PickedContact | null> {
  // Native app: the Capacitor plugin.
  if (isNative()) {
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

  // Browser (Android Chrome): the Web Contact Picker API.
  const picked = await pickWebContacts(false);
  return picked[0] ?? null;
}

/** Pick MANY contacts at once, for a one-time bulk import into the directory.
 *  Returns [] if unavailable, denied, or cancelled. Works in the native app
 *  and on browsers with the Web Contact Picker (Android Chrome); iOS Safari
 *  has no web contacts API, so there it returns []. */
export async function pickContacts(): Promise<PickedContact[]> {
  // Native app: prefer bulk getContacts, fall back to a single pick.
  if (isNative()) {
    try {
      const Contacts = registerPlugin<ContactsPlugin>("Contacts");
      await Contacts.requestPermissions();
      const projection = {
        name: true,
        phones: true,
        emails: true,
        postalAddresses: true,
      };
      if (Contacts.getContacts) {
        const { contacts } = await Contacts.getContacts({ projection });
        return (contacts ?? []).map(fromNative);
      }
      const { contact } = await Contacts.pickContact({ projection });
      return [fromNative(contact)];
    } catch {
      return [];
    }
  }

  // Browser (Android Chrome): the Web Contact Picker API, multiple.
  return pickWebContacts(true);
}

/** Shared Web Contact Picker call for one or many contacts. */
async function pickWebContacts(multiple: boolean): Promise<PickedContact[]> {
  const wc = webContacts();
  if (!wc) return [];
  try {
    const want = ["name", "tel", "email", "address"];
    let props = want;
    if (wc.getProperties) {
      const supported = await wc.getProperties().catch(() => [] as string[]);
      if (supported.length) {
        props = want.filter((p) => supported.includes(p));
        if (!props.length) props = ["name", "tel"];
      }
    }
    const results = await wc.select(props, { multiple });
    return (results ?? []).map((r) => {
      const a = r.address?.[0];
      const address = a
        ? [(a.addressLine ?? []).join(" "), a.city, a.region, a.postalCode]
            .filter(Boolean)
            .join(", ")
        : "";
      return {
        name: r.name?.[0] ?? "",
        phone: r.tel?.[0] ?? "",
        email: r.email?.[0] ?? "",
        address,
      };
    });
  } catch {
    return [];
  }
}
