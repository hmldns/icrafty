# Independent synthetic fixture expectations

Dimensions are test data, not measurements of a user's mug. Fixed tolerances:
0.001 mm for dimensions/distances; 0.001 mm² for area; 0.001 mm³ for volume;
1e-8 mm for analytic centroid assertions. Integer counts and booleans are exact.
These tolerances precede fixture execution and are far above OCCT's observed
roundoff while much smaller than the deliberate 1–2 mm errors.

The cylinder has r=10, h=20: volume=2000π, area=600π and centroid=(0,0,10).
The placed cylinder translates by (7,-4,3) and rotates 30° about X; centroid
is (7,-9,3+10 cos(π/6)). Its face-to-face length and circular face diameter
remain 20 mm, independently of its world-axis extents.

The open sleeve has R=20, r=18, h=12. Volume=912π; surface area
=2πRh+2πrh+2π(R²-r²)=1064π; centroid=(0,0,6). Its actual bore face
has diameter 36 mm and axial extent 12 mm.

The closed cap has R=20, r=18, H=12, roof=2 and cavity depth=10.
Volume=πR²H-πr²(H-roof)=1560π=4900.884539600077 mm³.
Area=outer lateral 480π + outer roof 400π + bore lateral 360π
+ inner roof 324π + rim 76π =1640π=5152.211951887261 mm².
Centroid z=(4800π·6-3240π·5)/(1560π)=105/13 mm.
The roof criterion is a distance between the delivered planar roof faces;
the bore diameter and cavity extent target the delivered cylindrical bore face.

Negative cases preserve these criteria. Bore radius 17 must fail bore, volume
and area. Roof=0 must make roof evidence unavailable and fail cavity/volume.
An extra detached radius-2, height-3 cylinder at x=30 must fail solid count,
outside width and volume. Each must retain diagnostic images.

STEP reopen thresholds are separately documented in NATIVE-MILESTONE.md:
1e-6 mm length and 1e-5 mm³ volume absolute, plus 1e-9 relative, exact
validity/count and explicit millimeter unit declaration.

Follow-on stages: bolt/nut bodies and named mating features; explicitly selected
thread pairs and custom nuts; boolean/fillet/chamfer/loft/sweep fixtures. Their
method gaps include intersection volume, sampled assembly clearance, profile and
pitch measurements, sections and close-ups. They remain outside this first gate.
