// Read-only OCCT mass properties over FreeCAD's public __toPythonOCC__ bridge.
%module crafty_properties
%{
#include <TopoDS_Shape.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <Standard_Failure.hxx>
#include <Standard_Version.hxx>
#include <cmath>
#include <vector>
%}
%include <std_vector.i>
%template(DoubleVector) std::vector<double>;
%exception {
    try { $action }
    catch (const Standard_Failure& e) { SWIG_exception(SWIG_RuntimeError, e.GetMessageString()); }
}
%nodefaultctor TopoDS_Shape;
class TopoDS_Shape { public: ~TopoDS_Shape(); };
// FreeCAD allocates a TopoDS wrapper sharing the original geometry. Explicit
// disown/delete avoids relying on cross-module SWIG proxy destructor registration.
%delobject dispose;
%inline %{
void dispose(TopoDS_Shape* shape) { delete shape; }
const char* occt_version() { return OCC_VERSION_COMPLETE; }
std::vector<double> properties(const TopoDS_Shape& shape) {
    GProp_GProps volume, area;
    double volume_error = 0;
    for (TopExp_Explorer ex(shape, TopAbs_SOLID); ex.More(); ex.Next()) {
        GProp_GProps solid;
        double error = BRepGProp::VolumePropertiesGK(ex.Current(), solid,
            1e-11, true, true, true, false, false);
        if (!std::isfinite(error) || error < 0)
            throw Standard_Failure("Adaptive volume integration failed");
        volume_error = std::max(volume_error, error);
        volume.Add(solid);
    }
    double area_error = BRepGProp::SurfaceProperties(shape, area, 1e-15, false);
    if (!std::isfinite(area_error) || area_error < 0)
        throw Standard_Failure("Adaptive surface integration failed");
    gp_Pnt center = volume.CentreOfMass();
    return {volume.Mass(), area.Mass(), center.X(), center.Y(), center.Z(), volume_error, area_error};
}
%}
