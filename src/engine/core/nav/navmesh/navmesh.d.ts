// The types of the vendored navmesh 2.3.1 (README.md): its dist/*.d.ts folded into one file, the part the engine
// uses. Upstream's NavPoly `implements jsastar.GridNode`, an import of javascript-astar's types; here its fields are
// written out instead, so nothing refers to javascript-astar. The grid-map parsers are not exported by navmesh.js.

/** A point-like object. */
interface Point {
  x: number;
  y: number;
}

/** Lightweight representation of a Polygon as a series of points. */
type PolyPoints = Point[];

type PointLike = Vector2 | Point;

/** Stripped down version of Phaser's Vector2 with just the functionality needed for navmeshes. */
declare class Vector2 {
  x: number;
  y: number;
  constructor(x?: number, y?: number);
  equals(v: PointLike): boolean;
  angle(v: PointLike): number;
  distance(v: PointLike): number;
  add(v: PointLike): void;
  subtract(v: PointLike): void;
  clone(): Vector2;
}

/** Stripped down version of Phaser's Line with just the functionality needed for navmeshes. */
declare class Line {
  start: Vector2;
  end: Vector2;
  left: number;
  right: number;
  top: number;
  bottom: number;
  constructor(x1: number, y1: number, x2: number, y2: number);
  pointOnSegment(x: number, y: number): boolean;
  pointOnLine(x: number, y: number): boolean;
}

/** Stripped down version of Phaser's Polygon with just the functionality needed for navmeshes. */
declare class Polygon {
  edges: Line[];
  points: Point[];
  private isClosed;
  constructor(points: Point[], closed?: boolean);
  contains(x: number, y: number): boolean;
}

/** A navigable polygon of a navmesh, the node of its A* graph (weight, toString, isWall, getCost). */
declare class NavPoly {
  id: number;
  polygon: Polygon;
  edges: Line[];
  neighbors: NavPoly[];
  portals: Line[];
  centroid: Vector2;
  boundingRadius: number;
  weight: number;
  x: number;
  y: number;
  constructor(id: number, polygon: Polygon);
  getPoints(): Point[];
  contains(point: Point): boolean;
  calculateCentroid(): Vector2;
  calculateRadius(): number;
  isPointOnEdge({ x, y }: Point): boolean;
  destroy(): void;
  toString(): string;
  isWall(): boolean;
  centroidDistance(navPolygon: NavPoly): number;
  getCost(navPolygon: NavPoly): number;
}

/**
 * A navigation mesh built from a series of polygons. Once built, the mesh can be asked for a path from one point to
 * another point.
 */
export declare class NavMesh {
  private meshShrinkAmount;
  private navPolygons;
  private graph;
  /**
   * @param meshPolygonPoints Array where each element is an array of point-like objects that defines a polygon.
   * @param meshShrinkAmount The amount (in pixels) that the navmesh has been shrunk around obstacles.
   */
  constructor(meshPolygonPoints: PolyPoints[], meshShrinkAmount?: number);
  /** Get the NavPolys that are in this navmesh. */
  getPolygons(): NavPoly[];
  /** Cleanup method to remove references. */
  destroy(): void;
  /** Find if the given point is within any of the polygons in the mesh. */
  isPointInMesh(point: Point): boolean;
  /**
   * Find the closest point in the mesh to the given point (up to maxAllowableDist): the distance, the polygon it is
   * closest to and the point inside the mesh (both null when none).
   */
  findClosestMeshPoint(
    point: Vector2,
    maxAllowableDist?: number,
  ): {
    distance: number;
    polygon: NavPoly | null;
    point: Point | null;
  };
  /** Find a path from the start point to the end point: an array of points, or null if no path. */
  findPath(startPoint: Point, endPoint: Point): Vector2[] | null;
  private calculateNeighbors;
  private getSegmentOverlap;
  private projectPointToPolygon;
}
