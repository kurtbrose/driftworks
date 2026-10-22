# Evacuation shuttle / first transport study

Original Driftworks model. Rebuild from the repository root:

    blender --background --python tools/build-evacuation-shuttle.py

`shuttle.blend` is editable authoring source; `shuttle.json` is the evaluated
mesh with smooth corner normals, grouped by material. Dimensions are metres,
bow +Y, dorsal +Z. The revised hull is 60 m long and approximately 25 m wide,
larger than the depot's approximately 39 m capped tanks. It is a broad passenger
transport with continuous curved shoulders, shaped rows of surface-conforming
windows, forehead glazing and integrated stern drives. The original 39 m
tube-and-tail silhouette has been replaced following the supplied references.
The muted blue-grey/teal livery is assigned to hull faces rather than raised
stripe geometry. No prominent wings or tail fin are used.

The dorsal refueling receptacle position and outward normal, plus engine
positions, are exported as local-coordinate anchors. These reserve interfaces
for approach alignment, arm mating and departure effects. Capacity, propulsion,
collision, docking and fuel-transfer rules are not established by this study.

The depot viewer places one shuttle near the first service arm, parallel to the
spine and in clear space outside the tank racks. It is a static scale and
silhouette review; the arm is not attached. The Shuttle / scale view includes
the existing fighter references. No existing flight session or ship catalog
is changed.
