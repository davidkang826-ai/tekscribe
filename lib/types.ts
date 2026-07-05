export type JobSummary = {
  jobTitle: string;
  workDone: string[];
  partsAndMaterials: string[];
  nextSteps: string[];
  customerRequests: string[]; // explicit asks from the customer; empty = none
  customerMessage: string;
};

export type Template = {
  id: string;
  name: string;
  content: string;
};

export type Customer = {
  name: string;
  email: string | null;
  phone: string | null;
};

export type Attachment = {
  path: string; // storage path in the visit-media bucket
  name: string;
  type: string; // mime type
};
