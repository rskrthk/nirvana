export type AsanaItem = {
  id: number;
  asanaCode: string;
  asanaName: string;
  asanaDetails: string;
  image: string;
  showExplanationVideo?: boolean;
  repeatCount?: number;
  type?: string;
};

export type AsanaPlanData = {
  id: number;
  userId: number;
  title: string;
  description: string;
  duration: string;
  rest: string;
  totalExercises: number;
  asanaList: AsanaItem[];
  selectedPranayamaList: AsanaItem[];
  excludePranayamaList: AsanaItem[];
  warmupInstruction: string;
  warmupSequences: AsanaItem[];
  warmupException: AsanaItem[];
  includeSN: boolean;
  planRegenerateAllowed: boolean;
};



export type ScreenOrientationLike = {
  lock?: (
    orientation:
      | "portrait"
      | "portrait-primary"
      | "portrait-secondary"
      | "landscape"
      | "landscape-primary"
      | "landscape-secondary"
  ) => Promise<void> | void;
  unlock?: () => void;
};


export type VideoSource = {
  url: string;
  resolution: "1080p" | "720p";
};


export type EnumValue = string | { name?: string; status?: string | null };

export type EnumResponse = {
  groupName?: string;
  values?: EnumValue[];
};

export type ReviewSection = {
  key: string;
  title: string;
  description: string;
  step?: number;
  rows?: { label: string; value: string }[];
  lists?: { label: string; items: string[] }[];
};

export type FormState = {
  firstName: string;
  lastName: string;
  countryCode: string;
  mobile: string;
  email: string;
  gender: string;
  age: string;
  day: string;
  month: string;
  year: string;
  city: string;
  state: string;
  country: string;
  currentHealth: string[];
  healthNotes: string;
  mostWorriedSymptoms: string[];
  yogaGoals: string[];
  yogaGoalNotes: string; // New
  surgeries: string[];
  surgeryNotes: string;
  familyHistory: string[];
  familyNotes: string;
  familyMembers: string[];
  stressLevel: string;
  physicalMetricsNotes: string; // New
  sleepPattern: string;
  nightRoutineNotes: string; // New
  yogaExperience: string;
  mealType: string;
  stayType: string;
  lifestyleNotes: string; // New
};