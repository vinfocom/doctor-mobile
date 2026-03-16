import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dashboard: undefined;
  Appointments: {
    openCreate?: boolean;
    prefillPatientPhone?: string;
    prefillPatientName?: string;
    prefillKey?: string;
  } | undefined;
  Clinics: undefined;
  Patients: undefined;
  CalendarView: undefined;
};

export type PatientTabParamList = {
  PatientHome: undefined;
  PatientAppointments: undefined;
  PatientAnnouncements: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  DoctorMain: NavigatorScreenParams<MainTabParamList> | undefined;
  PatientMain: undefined;
  Chat: { patientId: number; doctorId: number; patientName: string; viewer?: 'DOCTOR' | 'PATIENT' };
  Profile: undefined;
  StaffList: undefined;
  StaffForm: {
    mode: 'create' | 'edit';
    staff?: {
      staff_id: number;
      name: string | null;
      email: string | null;
      role: string | null;
      status: string | null;
      valid_from: string | null;
      valid_to: string | null;
      clinic_id: number | null;
      clinic_name?: string | null;
      doctor_whatsapp_number?: string | null;
    };
  };
  PatientProfile: undefined;
  PatientDetails: { patientId: number };
  DoctorAnnouncements: undefined;
};
