"""Placement and member-identity fixture. Expectations live outside this source."""


def build(parameters, inputs):
    import FreeCAD as App
    import Part

    print("CRAFTY_FIXTURE_BUILD placed-cylinder", flush=True)
    shape = Part.makeCylinder(10, 20)
    shape.Placement = App.Placement(App.Vector(7, -4, 3), App.Rotation(App.Vector(1, 0, 0), 30))
    return {"parts": {"body": shape}, "features": {"body": {
        "side": shape.Faces[0], "upper": shape.Faces[1], "lower": shape.Faces[2],
        "foreign": Part.makeCylinder(3, 5).Faces[0],
    }}}
