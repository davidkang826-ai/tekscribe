export type JobSummary = {
  jobTitle: string;
  workDone: string[];
  partsAndMaterials: string[];
  nextSteps: string[];
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
