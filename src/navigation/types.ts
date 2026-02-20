export type MainTabParamList = {
  Dashboard: undefined;
  Appointments: undefined;
  Clinics: undefined;
  Schedule: undefined;
  Patients: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Chat: { patientId: number; doctorId: number; patientName: string };
  Profile: undefined;
  PatientDetails: { patientId: number };
};
