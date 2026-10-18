### Changes

- **Personal undo on a shared Studio (4.2.2)**: Undo and Redo come back on a hosted Studio, each member's own: their
  last operation is undone by a new revision (its files back to their content before), whatever the others wrote
  meanwhile; refused when another wrote one of its files since (409) or holds its span (423). A new edit drops the
  member's redo; the stacks are kept in the database.
