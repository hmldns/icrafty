"""Starting source for a separately assigned correction trial. Deliberately wrong."""


def build(parameters, inputs):
    import Part

    outer_radius = 19
    inner_radius = 17
    total_height = 11
    roof_thickness = 1
    shape = Part.makeCylinder(outer_radius, total_height).cut(
        Part.makeCylinder(inner_radius, total_height-roof_thickness))
    features = {}
    for face in shape.Faces:
        if isinstance(face.Surface, Part.Cylinder) and abs(face.Surface.Radius-inner_radius) < 1e-8:
            features["bore"] = face
        elif isinstance(face.Surface, Part.Plane):
            if abs(face.CenterOfMass.z-total_height) < 1e-8:
                features["outer_roof"] = face
            elif abs(face.CenterOfMass.z-(total_height-roof_thickness)) < 1e-8:
                features["inner_roof"] = face
    return {"parts": {"cap": shape}, "features": {"cap": features}}
