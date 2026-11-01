import { GameRoom } from './GameRoom.js';
import { MapData } from '../types/game.js';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerRoomMap: Map<string, string> = new Map();
  private onStateBroadcast: (room: GameRoom) => void;
  private onAudioAlert: (roomCode: string, sound: string) => void;

  constructor(
    onStateBroadcast: (room: GameRoom) => void,
    onAudioAlert: (roomCode: string, sound: string) => void
  ) {
    this.onStateBroadcast = onStateBroadcast;
    this.onAudioAlert = onAudioAlert;
  }

  public createRoom(hostId: string, hostName: string, map?: MapData): GameRoom {
    const code = this.generateRoomCode();
    const room = new GameRoom(
      code,
      hostId,
      this.onStateBroadcast,
      this.onAudioAlert,
      map
    );

    room.addPlayer(hostId, hostName);
    this.rooms.set(code, room);
    this.playerRoomMap.set(hostId, code);

    console.log(`[ROOM CREATED] Room ${code} created by ${hostName} (${hostId}).`);
    return room;
  }

  public joinRoom(code: string, playerId: string, playerName: string): { success: boolean; room?: GameRoom; message?: string } {
    const cleanCode = code.toUpperCase().trim();
    const room = this.rooms.get(cleanCode);

    if (!room) {
      return { success: false, message: 'Room not found. Check the code and try again.' };
    }

    // Leave any existing room first
    this.leaveRoom(playerId);

    room.addPlayer(playerId, playerName);
    this.playerRoomMap.set(playerId, cleanCode);

    console.log(`[ROOM JOINED] Player ${playerName} (${playerId}) joined room ${cleanCode}.`);
    return { success: true, room };
  }

  public leaveRoom(playerId: string) {
    const code = this.playerRoomMap.get(playerId);
    if (!code) return;

    this.playerRoomMap.delete(playerId);
    const room = this.rooms.get(code);
    if (room) {
      room.removePlayer(playerId);
      console.log(`[ROOM LEFT] Player ${playerId} left room ${code}.`);

      // If room is empty, destroy it
      const realPlayers = Object.values(room.players).filter(p => !p.isBot);
      if (realPlayers.length === 0) {
        room.destroy();
        this.rooms.delete(code);
        console.log(`[ROOM DESTROYED] Room ${code} deleted (empty).`);
      }
    }
  }

  public getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  public getRoomByPlayerId(playerId: string): GameRoom | undefined {
    const code = this.playerRoomMap.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }
}

