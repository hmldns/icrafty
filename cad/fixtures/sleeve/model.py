"""Open sleeve, radius 20/18 mm and length 12 mm."""


def build(parameters, inputs):
    import Part

    print("CRAFTY_FIXTURE_BUILD sleeve", flush=True)
    shape = Part.makeCylinder(20, 12).cut(Part.makeCylinder(18, 12))
    bore = next(face for face in shape.Faces if isinstance(face.Surface, Part.Cylinder)
                and abs(face.Surface.Radius-18) < 1e-8)
    return {"parts": {"sleeve": shape}, "features": {"sleeve": {"bore": bore}}}
