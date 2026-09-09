"""Analytic cap converted to B-splines to exercise imported-shape bounds/meshing."""


def build(parameters, inputs):
    import Part
    shape = Part.makeCylinder(35, 16).cut(Part.makeCylinder(33, 14)).toNurbs()
    return {"parts": {"cap": shape}, "features": {}}
