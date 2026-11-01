export interface UserProfile {
  id: string;
  username: string;
  email: string;
  callsign: string;
  avatarUrl?: string;
  matchesPlayed: number;
  winsAsHider: number;
  winsAsHunter: number;
  totalCaptures: number;
  totalSurvivalSeconds: number;
  createdAt: number;
  lastLoginAt: number;
}

export interface StoredUser extends UserProfile {
  passwordHash: string;
  salt: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: UserProfile;
}
