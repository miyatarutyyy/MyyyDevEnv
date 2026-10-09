;;; memorandum.el --- Memorandum note display helpers -*- lexical-binding: t; -*-

(require 'cl-lib)

(defgroup memorandum nil
  "Personal research notes created by Memorandum."
  :group 'org)

(defcustom memorandum-notes-directory
  (or (getenv "MEMORANDUM_NOTES_DIR")
      (expand-file-name "org/memorundums" (getenv "HOME")))
  "Flat directory containing Memorandum Org notes."
  :type 'directory
  :group 'memorandum)

(defvar memorandum-main-window nil
  "Registered Emacs window used to display Memorandum notes.")

(defun memorandum--main-window ()
  "Return only a live window registered as the main editing window."
  (or (and (window-live-p memorandum-main-window)
           (window-parameter memorandum-main-window 'memorandum-main-window)
           memorandum-main-window)
      (cl-loop for frame in (frame-list)
               thereis (cl-loop for window in (window-list frame 'no-minibuffer)
                                when (window-parameter window 'memorandum-main-window)
                                return window))
      (error "No registered Memorandum main editing window")))

(defun memorandum-open-note (file)
  "Display Org note FILE in the existing main editing window.
Do not split windows, create frames, or save the note automatically."
  (interactive "fMemorandum note: ")
  (let* ((root (file-name-as-directory (expand-file-name memorandum-notes-directory)))
         (path (expand-file-name file)))
    (unless (and (string-suffix-p ".org" path)
                 (file-in-directory-p path root)
                 (file-regular-p path))
      (user-error "Not a regular Org file in memorandum-notes-directory: %s" path))
    (let ((window (memorandum--main-window))
          (buffer (find-file-noselect path)))
      (set-window-buffer window buffer)
      (with-current-buffer buffer
        (unless (derived-mode-p 'org-mode)
          (org-mode)))
      buffer)))

(provide 'memorandum)
;;; memorandum.el ends here
