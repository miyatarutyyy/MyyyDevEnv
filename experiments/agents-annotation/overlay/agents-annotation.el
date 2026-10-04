;;; agents-annotation.el --- Small sidecar annotation overlay PoC -*- lexical-binding: t; -*-

(require 'org)
(require 'subr-x)
(require 'cl-lib)

(defconst agents-annotation-data-file
  (expand-file-name "annotations.org" (file-name-directory (or load-file-name buffer-file-name)))
  "Org sidecar used by the annotation experiment.")

(defvar-local agents-annotation--overlays nil)
(defvar-local agents-annotation--source-file nil)

(defconst agents-annotation--types '("request" "question" "warning" "note"))

(defun agents-annotation--source-file ()
  (or buffer-file-name (user-error "Visit a file before annotating")))

(defun agents-annotation--records ()
  (when (file-exists-p agents-annotation-data-file)
    (with-temp-buffer
      (insert-file-contents agents-annotation-data-file)
      (org-mode)
      (let (records)
        (org-map-entries
         (lambda ()
           (let* ((props (org-entry-properties nil 'standard))
                  (content-start (save-excursion (org-back-to-heading t) (forward-line 1) (point)))
                  (content-end (save-excursion (org-end-of-subtree t t) (point))))
             (push (list :file (cdr (assoc "FILE" props))
                         :anchor (cdr (assoc "ANCHOR" props))
                         :type (cdr (assoc "TYPE" props))
                         :title (org-get-heading t t t t)
                         :text (string-trim (buffer-substring-no-properties content-start content-end)))
                   records)))
         nil 'file)
        (nreverse records)))))

(defun agents-annotation--anchor ()
  (let ((text (if (use-region-p)
                  (string-trim
                   (buffer-substring-no-properties
                    (region-beginning)
                    (min (save-excursion
                           (goto-char (region-beginning))
                           (line-end-position))
                         (region-end))))
                (string-trim (thing-at-point 'line t)))))
    (unless (and text (not (string-empty-p text)))
      (user-error "No non-empty anchor at point"))
    text))

(defun agents-annotation-add ()
  "Add an Org sidecar annotation anchored to the current heading, line, or region."
  (interactive)
  (let* ((source (file-relative-name (agents-annotation--source-file)
                                     (file-name-directory agents-annotation-data-file)))
         (anchor (agents-annotation--anchor))
         (type (completing-read "Type: " agents-annotation--types nil t))
         (title (read-string "Annotation title: " (concat type " " anchor)))
         (text (read-string "Annotation: ")))
    (with-current-buffer (find-file-noselect agents-annotation-data-file)
      (goto-char (point-max))
      (unless (bolp) (insert "\n"))
      (insert "\n* " title "\n:PROPERTIES:\n:FILE: " source
              "\n:ANCHOR: " anchor "\n:TYPE: " type "\n:END:\n\n" text "\n")
      (save-buffer))
    (message "Annotation saved in %s" agents-annotation-data-file)))

(defun agents-annotation--clear ()
  (mapc #'delete-overlay agents-annotation--overlays)
  (setq agents-annotation--overlays nil))

(defun agents-annotation--find-anchor (anchor)
  (save-excursion
    (goto-char (point-min))
    (let (positions)
      (while (re-search-forward (concat "^" (regexp-quote anchor) "[ \t]*$") nil t)
        (push (line-end-position) positions))
      (when (= (length positions) 1) (car positions)))))

(defun agents-annotation-show ()
  "Display matching sidecar notes in overlays in the current source buffer."
  (interactive)
  (agents-annotation--clear)
  (setq agents-annotation--source-file (agents-annotation--source-file))
  (let* ((source (file-relative-name agents-annotation--source-file
                                     (file-name-directory agents-annotation-data-file)))
         (records (cl-remove-if-not (lambda (r) (equal (plist-get r :file) source))
                                    (agents-annotation--records)))
         (shown 0))
    (dolist (record records)
      (let ((pos (agents-annotation--find-anchor (plist-get record :anchor))))
        (when pos
          (let* ((type (or (plist-get record :type) "note"))
                 (ov (make-overlay pos pos))
                 (label (format "\n  [%s] %s\n" (upcase type) (plist-get record :text))))
            (overlay-put ov 'after-string
                         (propertize label 'face (if (equal type "request")
                                                     'warning 'shadow)))
            (overlay-put ov 'agents-annotation record)
            (push ov agents-annotation--overlays)
            (cl-incf shown)))))
    (message "Displayed %d annotation(s); unmatched or ambiguous anchors are hidden" shown)))

(defun agents-annotation-hide ()
  "Hide all annotation overlays in the current buffer."
  (interactive)
  (agents-annotation--clear)
  (message "Annotation overlays hidden"))

(defun agents-annotation-edit ()
  "Open the Org sidecar at an annotation matching the current line."
  (interactive)
  (let* ((anchor (agents-annotation--anchor))
         (source (file-relative-name (agents-annotation--source-file)
                                     (file-name-directory agents-annotation-data-file))))
    (find-file agents-annotation-data-file)
    (goto-char (point-min))
    (if (re-search-forward
         (concat ":FILE: " (regexp-quote source) "\n:ANCHOR: " (regexp-quote anchor) "\n") nil t)
        (org-back-to-heading t)
      (user-error "No sidecar annotation found for this anchor"))))

(defun agents-annotation-export-requests ()
  "Copy request annotations for the current file to the kill ring and display them."
  (interactive)
  (let* ((source (file-relative-name (agents-annotation--source-file)
                                     (file-name-directory agents-annotation-data-file)))
         (requests (cl-remove-if-not
                    (lambda (r) (and (equal (plist-get r :file) source)
                                     (equal (plist-get r :type) "request")))
                    (agents-annotation--records)))
         (text (concat "The user added the following annotations to AGENTS.md:\n\n"
                       (mapconcat (lambda (r)
                                    (format "%s\n\n>>> %s"
                                            (plist-get r :anchor) (plist-get r :text)))
                                  requests "\n\n"))))
    (kill-new text)
    (with-current-buffer (get-buffer-create "*AGENTS annotation export*")
      (erase-buffer) (insert text) (special-mode) (display-buffer (current-buffer)))
    (message "Copied %d request annotation(s)" (length requests))))

(provide 'agents-annotation)
;;; agents-annotation.el ends here
