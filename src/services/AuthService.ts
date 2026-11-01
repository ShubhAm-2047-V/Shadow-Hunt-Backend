import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { UserProfile, StoredUser, AuthResponse } from '../types/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'campus-hunt-tactical-secret-key-2026';

export class AuthService {
  private static instance: AuthService;
  private users: Map<string, StoredUser> = new Map(); // id -> StoredUser
  private usernameIndex: Map<string, string> = new Map(); // lowercase username -> id
  private emailIndex: Map<string, string> = new Map(); // lowercase email -> id
  private storageFilePath: string;

  private constructor() {
    // Choose appropriate storage path: /tmp for serverless, local data/ for persistent node
    if (process.env.VERCEL) {
      this.storageFilePath = path.join('/tmp', 'campus_hunt_users.json');
    } else {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
      }
      this.storageFilePath = path.join(dataDir, 'users.json');
    }

    this.loadFromDisk();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf8');
        const list: StoredUser[] = JSON.parse(raw);
        for (const user of list) {
          this.users.set(user.id, user);
          this.usernameIndex.set(user.username.toLowerCase(), user.id);
          this.emailIndex.set(user.email.toLowerCase(), user.id);
        }
        console.log(`[AUTH] Loaded ${this.users.size} registered operator(s) from disk.`);
      }
    } catch (err) {
      console.warn('[AUTH] Could not load user database from disk:', err);
    }
  }

  private saveToDisk() {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[AUTH] Failed to persist user database to disk:', err);
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  private generateToken(user: UserProfile): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        username: user.username,
        callsign: user.callsign,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      })
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  public verifyToken(token: string): UserProfile | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const expectedSig = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature !== expectedSig) return null;

      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }

      return this.getUserById(decoded.sub);
    } catch (_) {
      return null;
    }
  }

  public getUserById(id: string): UserProfile | null {
    const user = this.users.get(id);
    if (!user) return null;
    return this.sanitizeProfile(user);
  }

  private sanitizeProfile(stored: StoredUser): UserProfile {
    const { passwordHash, salt, ...profile } = stored;
    return profile;
  }

  /**
   * Register a new operator
   */
  public async register(
    username: string,
    email: string,
    password: string,
    callsign?: string
  ): Promise<AuthResponse> {
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCallsign = (callsign || cleanUser).trim();

    if (!cleanUser || cleanUser.length < 3) {
      return { success: false, message: 'Username must be at least 3 characters long.' };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Enter a valid email address.' };
    }
    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    if (this.usernameIndex.has(cleanUser.toLowerCase())) {
      return { success: false, message: 'Username is already taken by another operator.' };
    }
    if (this.emailIndex.has(cleanEmail)) {
      return { success: false, message: 'An account with this email already exists.' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const userId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const storedUser: StoredUser = {
      id: userId,
      username: cleanUser,
      email: cleanEmail,
      callsign: cleanCallsign,
      matchesPlayed: 0,
      winsAsHider: 0,
      winsAsHunter: 0,
      totalCaptures: 0,
      totalSurvivalSeconds: 0,
      createdAt: now,
      lastLoginAt: now,
      passwordHash,
      salt
    };

    this.users.set(userId, storedUser);
    this.usernameIndex.set(cleanUser.toLowerCase(), userId);
    this.emailIndex.set(cleanEmail, userId);
    this.saveToDisk();

    const userProfile = this.sanitizeProfile(storedUser);
    const token = this.generateToken(userProfile);

    console.log(`[AUTH] New operator registered: ${cleanUser} (${cleanCallsign})`);
    return { success: true, token, user: userProfile };
  }

  /**
   * Authenticate an existing operator
   */
  public async login(usernameOrEmail: string, password: string): Promise<AuthResponse> {
    const identifier = usernameOrEmail.trim().toLowerCase();
    const userId = this.usernameIndex.get(identifier) || this.emailIndex.get(identifier);

    if (!userId) {
      return { success: false, message: 'Invalid credentials. Operator not found.' };
    }

    const storedUser = this.users.get(userId);
    if (!storedUser) {
      return { success: false, message: 'Invalid credentials.' };
    }

    const testHash = this.hashPassword(password, storedUser.salt);
    if (testHash !== storedUser.passwordHash) {
      return { success: false, message: 'Incorrect password.' };
    }

    storedUser.lastLoginAt = Date.now();
    this.saveToDisk();

    const userProfile = this.sanitizeProfile(storedUser);
    const token = this.generateToken(userProfile);

    console.log(`[AUTH] Operator logged in: ${storedUser.username}`);
    return { success: true, token, user: userProfile };
  }

  /**
   * Update match stats for a player when match concludes
   */
  public recordMatchOutcome(
    playerIdOrName: string,
    team: 'HIDERS' | 'HUNTERS',
    isWinner: boolean,
    captures: number,
    survivedSeconds: number
  ) {
    // Try matching by ID or by username/callsign
    let user = this.users.get(playerIdOrName);
    if (!user) {
      const lower = playerIdOrName.toLowerCase();
      const id = this.usernameIndex.get(lower);
      if (id) user = this.users.get(id);
    }

    if (user) {
      user.matchesPlayed++;
      if (team === 'HIDERS' && isWinner) user.winsAsHider++;
      if (team === 'HUNTERS' && isWinner) user.winsAsHunter++;
      user.totalCaptures += captures;
      user.totalSurvivalSeconds += Math.round(survivedSeconds);
      this.saveToDisk();
      console.log(`[AUTH STATS] Updated career stats for ${user.username}: ${user.matchesPlayed} matches, ${user.totalCaptures} captures`);
    }
  }

  /**
   * Fetch top operators by captures and wins
   */
  public getLeaderboard(limit = 10): UserProfile[] {
    const list = Array.from(this.users.values())
      .map(u => this.sanitizeProfile(u))
      .sort((a, b) => (b.totalCaptures * 2 + (b.winsAsHider + b.winsAsHunter) * 5) - (a.totalCaptures * 2 + (a.winsAsHider + a.winsAsHunter) * 5));
    return list.slice(0, limit);
  }
}
