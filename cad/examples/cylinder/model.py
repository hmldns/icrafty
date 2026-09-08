"""Input example for the proposed evaluator; execute in FreeCAD's Python."""


def build(parameters: dict, inputs: dict) -> dict:
    import Part

    body = Part.makeCylinder(parameters["radius_mm"], parameters["height_mm"])
    return {"parts": {"body": body}, "features": {}}
