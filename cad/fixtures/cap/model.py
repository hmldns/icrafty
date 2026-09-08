"""Synthetic closed-end-cap fixture; independent criteria are in criteria.json."""


def build(parameters, inputs):
    import FreeCAD as App
    import Part

    print("CRAFTY_FIXTURE_BUILD cap", flush=True)
    radius = parameters.get("outer_radius", 20)
    bore = parameters.get("bore_radius", 18)
    height = parameters.get("height", 12)
    roof = parameters.get("roof", 2)
    shape = Part.makeCylinder(radius, height).cut(Part.makeCylinder(bore, height-roof))
    if parameters.get("extra_solid", False):
        shape = Part.makeCompound([shape, Part.makeCylinder(2, 3, App.Vector(30, 0, 0))])
    features = {}
    for face in shape.Faces:
        if isinstance(face.Surface, Part.Cylinder) and abs(face.Surface.Radius-bore) < 1e-8:
            features["bore"] = face
        elif isinstance(face.Surface, Part.Plane):
            z = face.CenterOfMass.z
            if abs(z-height) < 1e-8:
                features["outer_roof"] = face
            elif abs(z-(height-roof)) < 1e-8 and roof > 0:
                features["inner_roof"] = face
            elif abs(z) < 1e-8:
                features["rim"] = face
    return {"parts": {"cap": shape}, "features": {"cap": features}}
