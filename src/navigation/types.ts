export type MainTabParamList = {
  Dashboard: undefined;
  Appointments: undefined;
  Clinics: undefined;
  Schedule: undefined;
  Patients: undefined;
};

export type PatientTabParamList = {
  PatientHome: undefined;
  PatientAnnouncements: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  DoctorMain: undefined;
  PatientMain: undefined;
  Chat: { patientId: number; doctorId: number; patientName: string; viewer?: 'DOCTOR' | 'PATIENT' };
  Profile: undefined;
  PatientDetails: { patientId: number };
  DoctorAnnouncements: undefined;
};
