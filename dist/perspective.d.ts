export interface EyePerspective {
    fw: number;
    fh: number;
}
/**
 * @param gx gaze -1..1 (right is positive), @param gy gaze -1..1 (down is positive)
 * @param eyeX distance of this eye from the face centre in core units, negative for the left eye
 * @param strength 0 = flat (factors are 1), 1 = default
 */
export declare function eyePerspective(gx: number, gy: number, eyeX: number, strength?: number): EyePerspective;
