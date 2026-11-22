# QA: A person's panel

A manual check of opening a person from People, their tabs, editing them in place, their history and removing them, against a development stack.

## Setup

1. Start the stack, create the owner and add a few employees as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open `/people`.

## Open and close

- [ ] Clicking anywhere in a row opens that person's panel over the list; the URL becomes `/people/<id>` and keeps the list's search and sort.
- [ ] Tab to a name and press Enter: the same panel opens.
- [ ] The panel shows the avatar and name, then the tabs Overview and History; Overview shows Work email, then Details with Personal: First name and Last name.
- [ ] Choosing History adds `?tab=history` to the URL; reloading keeps History open; Overview removes it again. Closing the panel leaves no tab in the People URL.
- [ ] Close (×), Escape and the browser Back button close the panel and return to the same list.
- [ ] Reloading `/people/<id>` opens the panel again; an unknown id shows "This person doesn’t exist." with Back to People.

## Edit in place

- [ ] Hovering a value shows a pencil; clicking it (or Enter on it) turns it into a text field.
- [ ] The work email is edited in the Work email card at the top.
- [ ] Editing two fields marks each with a green bar; the bar at the bottom says "2 unsaved changes · <fields in panel order> · saved as one history entry".
- [ ] Changing a field back to its saved value removes its mark; Escape inside a field reverts only that field; Cancel reverts everything and hides the bar.
- [ ] "Add reason" turns into one optional field; Save with a reason adds one history line "updated 2 fields: …" with the reason; expanding it shows each old → new value.
- [ ] Save of one field reads "changed first name <old> → <new>".
- [ ] The People row shows the new values after Save.
- [ ] Clearing the first name, or entering an email another person has, keeps the field open with "Enter a value." or "Another person has this email." and saves nothing; typing a correction keeps the field open.

## Leaving with unsaved changes

- [ ] With unsaved changes, Close, Escape or Back asks "Discard N unsaved changes?"; Keep editing stays, Discard leaves without saving.
- [ ] With unsaved changes, choosing History asks the same; Discard opens History and Overview shows the saved values.
- [ ] Reloading or closing the tab with unsaved changes shows the browser's own leave prompt.

## History

- [ ] Lines are newest first, grouped "Today", "Yesterday", "21 Oct"; each has the author (the owner's email for their own changes, "You"), the cause when it is not a direct edit, and the time.
- [ ] A person added with the API shows "You added <first name> with 3 fields: …".
- [ ] With more than 50 lines, "Show older changes" loads the rest.

## Remove

- [ ] ⋯ → "Remove <name>" asks "Remove <name>?" with an optional reason; Cancel keeps them.
- [ ] Remove closes the panel, shows "<name> removed" and the person leaves People; browser Back then shows "This person doesn’t exist."
- [ ] Pressing Back while a removal is still pending and opening another person keeps that person's panel open when the removal ends.

## Keyboard and narrow screens

- [ ] The whole flow works with the keyboard alone: open, edit, Add reason, Save, ⋯, Remove, Close.
- [ ] At phone width the panel fills the screen, the Details sections stack and the edit bar wraps.
