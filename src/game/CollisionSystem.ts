import { BuildingData, Vector3D } from '../types/game.js';
import { isPointInsidePolygon } from '../osm/geoConverter.js';

export class CollisionSystem {
  private buildings: BuildingData[] = [];
  private boundaryPolygon: [number, number][] = [];
  private playerRadius = 0.5; // Half meter cylinder

  constructor(buildings: BuildingData[], boundaryPolygon: [number, number][]) {
    this.buildings = buildings;
    this.boundaryPolygon = boundaryPolygon;
  }

  /**
   * Validates and resolves player desired position against building walls and boundary polygon.
   * Uses sliding response against collided edges.
   */
  public resolveMovement(
    currentPos: Vector3D,
    desiredPos: Vector3D
  ): Vector3D {
    let resolvedX = desiredPos.x;
    let resolvedZ = desiredPos.z;

    // 1. Boundary check: must stay inside the campus boundary
    if (!isPointInsidePolygon(resolvedX, resolvedZ, this.boundaryPolygon)) {
      // If desired position is outside, try sliding along X or Z
      if (isPointInsidePolygon(resolvedX, currentPos.z, this.boundaryPolygon)) {
        resolvedZ = currentPos.z;
      } else if (isPointInsidePolygon(currentPos.x, resolvedZ, this.boundaryPolygon)) {
        resolvedX = currentPos.x;
      } else {
        resolvedX = currentPos.x;
        resolvedZ = currentPos.z;
      }
    }

    // 2. Building collision check
    for (const bldg of this.buildings) {
      if (this.isCollidingWithBuilding(resolvedX, resolvedZ, bldg)) {
        // Try sliding X only
        if (!this.isCollidingWithBuilding(resolvedX, currentPos.z, bldg)) {
          resolvedZ = currentPos.z;
        } else if (!this.isCollidingWithBuilding(currentPos.x, resolvedZ, bldg)) {
          resolvedX = currentPos.x;
        } else {
          resolvedX = currentPos.x;
          resolvedZ = currentPos.z;
        }
        break;
      }
    }

    return {
      x: resolvedX,
      y: desiredPos.y,
      z: resolvedZ
    };
  }

  private isCollidingWithBuilding(x: number, z: number, bldg: BuildingData): boolean {
    const pts = bldg.points;
    if (pts.length < 3) return false;

    // Check if circle of player intersects any building segment or is inside
    if (isPointInsidePolygon(x, z, pts)) {
      return true;
    }

    // Check distance to edges
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const dist = this.distToSegment(x, z, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (dist < this.playerRadius) {
        return true;
      }
    }

    return false;
  }

  private distToSegment(
    px: number, pz: number,
    x1: number, z1: number,
    x2: number, z2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1);
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);

    let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * (x2 - x1);
    const projZ = z1 + t * (z2 - z1);

    return Math.hypot(px - projX, pz - projZ);
  }
}

